import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppStage, GameState, QuizQuestion, QuizResult, GameMode, TeacherType } from './types';
import { generateQuizFromImages, generateAdvice, generateDetailedExplanation } from './services/geminiService';
import { isRetryableApiError, describeApiError } from './services/retryPolicy';
import { isFastRetryEnabled, setFastRetryEnabled } from './services/featureFlags';
import { shuffleOptions } from './services/quizValidation';
import { buildRecord, clearHistory, loadHistory, saveRecord, PlayRecord, WrongItem } from './services/history';
import { Modal } from './components/Modal';
import { ApiStatus } from './components/ApiStatus';
import { FitScreen } from './components/FitScreen';
import { TitleScreen } from './screens/TitleScreen';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { PlayingScreen } from './screens/PlayingScreen';
import { FeedbackScreen } from './screens/FeedbackScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { HistoryScreen } from './screens/HistoryScreen';

const MAX_IMAGES = 50;
// 答えを押してから解説画面に移るまで（正解・不正解の色を見せる時間）
const ANSWER_REVEAL_MS = 600;

const initialState = (): GameState => ({
  stage: AppStage.TITLE,
  mode: GameMode.STUDY,
  teacher: TeacherType.SUNAO,
  images: [],
  imageStats: [],
  questions: [],
  currentQuestionIndex: 0,
  results: [],
});

/** 解き直し用に、選択肢の並びを変えた問題を作る */
const toReviewQuestions = (items: Pick<QuizQuestion, 'question' | 'options' | 'correctAnswerIndex' | 'explanation'>[]): QuizQuestion[] => {
  const now = Date.now();
  return items.map((q, i) => shuffleOptions({
    id: `review-${i}-${now}`,
    question: q.question,
    options: [...q.options],
    correctAnswerIndex: q.correctAnswerIndex,
    explanation: q.explanation,
  }));
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(initialState);

  // 隠し機能: 画像解析結果を再利用して再試行を高速化する（デフォルトON）
  const [fastRetryEnabled, setFastRetryEnabledState] = useState<boolean>(() => isFastRetryEnabled());
  const toggleFastRetry = () => {
    setFastRetryEnabledState(prev => {
      const next = !prev;
      setFastRetryEnabled(next);
      return next;
    });
  };

  const [history, setHistory] = useState<PlayRecord[]>(() => loadHistory());
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextQuestionLockRef = useRef(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'info' | 'success' }>({
    isOpen: false, title: '', message: '', type: 'info',
  });

  const [isQuitConfirmOpen, setIsQuitConfirmOpen] = useState(false);
  const [isDetailedModalOpen, setIsDetailedModalOpen] = useState(false);
  const [isGeneratingDetailed, setIsGeneratingDetailed] = useState(false);
  const [activeDetailedExplanation, setActiveDetailedExplanation] = useState('');

  const imageUrls = useMemo(() => gameState.images.map(file => URL.createObjectURL(file)), [gameState.images]);
  useEffect(() => () => imageUrls.forEach(url => URL.revokeObjectURL(url)), [imageUrls]);

  // FEEDBACK画面に入るたびに「つぎの問題へ」の連打ロックを解除する
  useEffect(() => {
    if (gameState.stage === AppStage.FEEDBACK) nextQuestionLockRef.current = false;
  }, [gameState.stage, gameState.currentQuestionIndex]);

  const showModal = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  };

  const clearAnswerTimeout = () => {
    if (answerTimeoutRef.current !== null) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
  };

  const handleImagesSelected = (files: File[]) => {
    if (files.length > MAX_IMAGES) {
      showModal('写真が多すぎるよ', `一度に${MAX_IMAGES}まいまでだよ！`, 'error');
      return;
    }
    setGameState(prev => ({
      ...prev,
      images: files,
      imageStats: files.map(() => ({ timesSelected: 0, wrongCount: 0, questionCount: 0 })),
    }));
  };

  const backToTitle = () => {
    clearAnswerTimeout();
    // 写真と設定は残す（同じ写真でまた遊べるように）
    setGameState(prev => ({
      ...initialState(),
      mode: prev.mode,
      teacher: prev.teacher,
      images: prev.images,
      imageStats: prev.imageStats,
    }));
    setSelectedAnswer(null);
    setIsQuitConfirmOpen(false);
  };

  const startGeneration = async () => {
    if (gameState.images.length === 0) return;
    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, loadingMessage: '準備中...' }));
    try {
      const { questions, selectedIndices } = await generateQuizFromImages(
        gameState.images,
        gameState.imageStats,
        gameState.mode,
        gameState.teacher,
        (msg) => setGameState(prev => ({ ...prev, loadingMessage: msg })),
        fastRetryEnabled,
      );

      // sourceImageIndexを「元のimages配列のインデックス」に正規化
      const normalizedQuestions = questions.map(q => {
        const raw = q.sourceImageIndex;
        const isValid = typeof raw === 'number' && raw >= 0 && raw < selectedIndices.length;
        return { ...q, sourceImageIndex: isValid ? selectedIndices[raw as number] : undefined };
      });

      setGameState(prev => {
        const newStats = prev.imageStats.map((s, i) =>
          selectedIndices.includes(i) ? { ...s, timesSelected: s.timesSelected + 1 } : s,
        );
        normalizedQuestions.forEach(q => {
          if (q.sourceImageIndex !== undefined && newStats[q.sourceImageIndex]) {
            newStats[q.sourceImageIndex] = {
              ...newStats[q.sourceImageIndex],
              questionCount: newStats[q.sourceImageIndex].questionCount + 1,
            };
          }
        });
        return {
          ...prev,
          imageStats: newStats,
          questions: normalizedQuestions,
          isReview: false,
          stage: AppStage.PLAYING,
          currentQuestionIndex: 0,
          results: [],
          advice: undefined,
        };
      });
      setSelectedAnswer(null);
      setStartTime(Date.now());
    } catch (error: any) {
      console.error(error);
      setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
      // 混雑・クォータ起因なら「待てば直る」ことを伝える
      const friendly = isRetryableApiError(error)
        ? 'AIがこみあっているみたい。少し待ってから、もう一度ためしてね。'
        : 'クイズを作れませんでした。写真をかえてためしてみてね。';
      showModal('クイズを作れなかったよ', `${friendly}\n\n【原因】${describeApiError(error)}`, 'error');
    }
  };

  /** まちがえた問題だけで遊ぶ（AIは呼ばない） */
  const startReview = (items: Pick<QuizQuestion, 'question' | 'options' | 'correctAnswerIndex' | 'explanation'>[]) => {
    if (items.length === 0) return;
    clearAnswerTimeout();
    setGameState(prev => ({
      ...prev,
      questions: toReviewQuestions(items),
      isReview: true,
      stage: AppStage.PLAYING,
      currentQuestionIndex: 0,
      results: [],
      advice: undefined,
    }));
    setSelectedAnswer(null);
    setStartTime(Date.now());
  };

  const retryWrongFromSummary = () => {
    const wrongQuestions = gameState.results
      .filter(r => !r.isCorrect)
      .map(r => gameState.questions[r.questionIndex])
      .filter((q): q is QuizQuestion => !!q);
    startReview(wrongQuestions);
  };

  const practiceFromHistory = (items: WrongItem[]) => startReview(items);

  const handleAnswer = useCallback((optionIndex: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(optionIndex);
    const timeTaken = (Date.now() - startTime) / 1000;
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
    const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;
    const newResult: QuizResult = {
      questionIndex: gameState.currentQuestionIndex,
      isCorrect,
      timeTakenSeconds: timeTaken,
      chosenIndex: optionIndex,
    };

    answerTimeoutRef.current = setTimeout(() => {
      answerTimeoutRef.current = null;
      setGameState(prev => {
        const srcIdx = currentQuestion.sourceImageIndex;
        // 解き直しでは画像の統計を変えない（同じまちがいを二重に数えないため）
        const newStats = (!prev.isReview && !isCorrect && srcIdx !== undefined && prev.imageStats[srcIdx])
          ? prev.imageStats.map((s, i) => i === srcIdx ? { ...s, wrongCount: s.wrongCount + 1 } : s)
          : prev.imageStats;
        return {
          ...prev,
          stage: AppStage.FEEDBACK,
          imageStats: newStats,
          results: [...prev.results, newResult],
        };
      });
    }, ANSWER_REVEAL_MS);
  }, [selectedAnswer, startTime, gameState.questions, gameState.currentQuestionIndex]);

  // 出題ずみの問題インジケータをタップして、その問題からやり直す
  const jumpToQuestion = (index: number) => {
    if (index >= gameState.currentQuestionIndex) return;
    clearAnswerTimeout();
    const undoneResults = gameState.results.slice(index);
    setGameState(prev => {
      const revertedStats = prev.imageStats.map(s => ({ ...s }));
      if (!prev.isReview) {
        undoneResults.forEach(r => {
          if (r.isCorrect) return;
          const srcIdx = prev.questions[r.questionIndex]?.sourceImageIndex;
          if (srcIdx !== undefined && revertedStats[srcIdx]) {
            revertedStats[srcIdx] = { ...revertedStats[srcIdx], wrongCount: Math.max(0, revertedStats[srcIdx].wrongCount - 1) };
          }
        });
      }
      return {
        ...prev,
        stage: AppStage.PLAYING,
        currentQuestionIndex: index,
        results: prev.results.slice(0, index),
        imageStats: revertedStats,
      };
    });
    setSelectedAnswer(null);
    setStartTime(Date.now());
  };

  const nextQuestion = async () => {
    if (nextQuestionLockRef.current) return;
    nextQuestionLockRef.current = true;
    setSelectedAnswer(null);
    const total = gameState.questions.length;
    if (gameState.currentQuestionIndex + 1 >= total) {
      const correctCount = gameState.results.filter(r => r.isCorrect).length;
      // 励ましの言葉は10問満点の表で選ぶので、問題数が違うときは10点満点に直す
      const advice = await generateAdvice(Math.round((correctCount / Math.max(1, total)) * 10));
      const record = buildRecord({
        mode: gameState.mode,
        teacher: gameState.teacher,
        isReview: !!gameState.isReview,
        questions: gameState.questions,
        results: gameState.results,
      });
      saveRecord(record);
      setHistory(loadHistory());
      setGameState(prev => ({ ...prev, advice, stage: AppStage.SUMMARY }));
    } else {
      setGameState(prev => ({
        ...prev,
        stage: AppStage.PLAYING,
        currentQuestionIndex: prev.currentQuestionIndex + 1,
      }));
      setStartTime(Date.now());
    }
  };

  // 詳細解説を生成・表示する
  const handleShowDetailedExplanation = async () => {
    const index = gameState.currentQuestionIndex;
    const currentQ = gameState.questions[index];

    // キャッシュがあればそれを使う
    if (currentQ.detailedExplanation) {
      setActiveDetailedExplanation(currentQ.detailedExplanation);
      setIsDetailedModalOpen(true);
      return;
    }

    setIsGeneratingDetailed(true);
    setIsDetailedModalOpen(true);
    try {
      const detail = await generateDetailedExplanation(currentQ, gameState.teacher);
      setGameState(prev => ({
        ...prev,
        questions: prev.questions.map((q, i) => i === index ? { ...q, detailedExplanation: detail } : q),
      }));
      setActiveDetailedExplanation(detail);
    } catch (error) {
      console.error(error);
      setActiveDetailedExplanation(`ごめんね。AI先生が考えすぎてエラーになっちゃった。もう一度ボタンを押してみてね。\n\n【原因】${describeApiError(error)}`);
    } finally {
      setIsGeneratingDetailed(false);
    }
  };

  const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
  const lastResult = gameState.results[gameState.results.length - 1];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ApiStatus />
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />

      {gameState.stage === AppStage.TITLE && (
        <FitScreen>
          <TitleScreen
            mode={gameState.mode}
            teacher={gameState.teacher}
            imageCount={gameState.images.length}
            imageUrls={imageUrls}
            maxImages={MAX_IMAGES}
            historyCount={history.length}
            fastRetryEnabled={fastRetryEnabled}
            onModeChange={mode => setGameState(prev => ({ ...prev, mode }))}
            onTeacherChange={teacher => setGameState(prev => ({ ...prev, teacher }))}
            onImagesSelected={handleImagesSelected}
            onStart={startGeneration}
            onOpenHistory={() => setGameState(prev => ({ ...prev, stage: AppStage.HISTORY }))}
            onToggleFastRetry={toggleFastRetry}
          />
        </FitScreen>
      )}

      {gameState.stage === AppStage.GENERATING && (
        <FitScreen>
          <GeneratingScreen message={gameState.loadingMessage} imageCount={gameState.images.length} />
        </FitScreen>
      )}

      {gameState.stage === AppStage.PLAYING && currentQuestion && (
        <FitScreen>
          <PlayingScreen
            question={currentQuestion}
            index={gameState.currentQuestionIndex}
            total={gameState.questions.length}
            results={gameState.results}
            selectedAnswer={selectedAnswer}
            isReview={!!gameState.isReview}
            isQuitConfirmOpen={isQuitConfirmOpen}
            onAnswer={handleAnswer}
            onJump={jumpToQuestion}
            onQuit={() => setIsQuitConfirmOpen(true)}
            onConfirmQuit={backToTitle}
            onCancelQuit={() => setIsQuitConfirmOpen(false)}
          />
        </FitScreen>
      )}

      {gameState.stage === AppStage.FEEDBACK && currentQuestion && lastResult && (
        <FitScreen>
          <FeedbackScreen
            question={currentQuestion}
            isCorrect={lastResult.isCorrect}
            chosenIndex={lastResult.chosenIndex}
            isLast={gameState.currentQuestionIndex + 1 >= gameState.questions.length}
            onNext={nextQuestion}
            onShowDetail={handleShowDetailedExplanation}
            detail={{
              open: isDetailedModalOpen,
              loading: isGeneratingDetailed,
              text: activeDetailedExplanation,
              onClose: () => setIsDetailedModalOpen(false),
            }}
          />
        </FitScreen>
      )}

      {gameState.stage === AppStage.SUMMARY && (
        <FitScreen>
          <SummaryScreen
            questions={gameState.questions}
            results={gameState.results}
            advice={gameState.advice}
            isReview={!!gameState.isReview}
            canPlayAgain={gameState.images.length > 0}
            onRetryWrong={retryWrongFromSummary}
            onPlayAgain={startGeneration}
            onFinish={backToTitle}
          />
        </FitScreen>
      )}

      {gameState.stage === AppStage.HISTORY && (
        <HistoryScreen
          history={history}
          onBack={() => setGameState(prev => ({ ...prev, stage: AppStage.TITLE }))}
          onPracticeWrong={practiceFromHistory}
          onClear={() => {
            clearHistory();
            setHistory([]);
            setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
          }}
        />
      )}
    </div>
  );
};

export default App;

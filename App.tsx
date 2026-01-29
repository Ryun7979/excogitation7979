
import React, { useState } from 'react';
import { Upload, ChevronRight, ArrowLeft, Loader2, Star, BookOpen } from 'lucide-react';
import { AppStage, GameState, QuizResult, TOTAL_QUESTIONS, GameMode, TeacherType } from './types';
import { generateQuizFromImages, generateAdvice } from './services/geminiService';
import { Button } from './components/Button';
import { ProgressBar } from './components/ProgressBar';
import { Modal } from './components/Modal';
import { ApiStatus } from './components/ApiStatus';

const MAX_IMAGES = 10;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    stage: AppStage.TITLE,
    mode: GameMode.STUDY,
    teacher: TeacherType.SUNAO,
    images: [],
    questions: [],
    currentQuestionIndex: 0,
    results: [],
  });

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'info' | 'success' }>({
    isOpen: false, title: '', message: '', type: 'info'
  });

  const showModal = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files as FileList);
      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `一度に${MAX_IMAGES}枚までだよ！`, 'error');
        return;
      }
      setGameState(prev => ({ ...prev, images: files }));
    }
  };

  const backToTitle = () => {
    setGameState({
      stage: AppStage.TITLE,
      mode: GameMode.STUDY,
      teacher: TeacherType.SUNAO,
      images: [],
      questions: [],
      currentQuestionIndex: 0,
      results: [],
    });
    setSelectedAnswer(null);
  };

  const startGeneration = async () => {
    if (gameState.images.length === 0) return;
    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, loadingMessage: "クイズを考えているよ..." }));
    try {
      const questions = await generateQuizFromImages(
        gameState.images, 
        gameState.mode,
        gameState.teacher,
        (msg) => setGameState(prev => ({ ...prev, loadingMessage: msg }))
      );
      setGameState(prev => ({ ...prev, questions, stage: AppStage.PLAYING, currentQuestionIndex: 0, results: [] }));
      setStartTime(Date.now());
    } catch (error: any) {
      setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
      showModal('エラー', "問題が作れなかったよ...", 'error');
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (selectedAnswer !== null) return; 
    setSelectedAnswer(optionIndex);
    const timeTaken = (Date.now() - startTime) / 1000;
    const isCorrect = optionIndex === gameState.questions[gameState.currentQuestionIndex].correctAnswerIndex;
    const newResult: QuizResult = {
      questionIndex: gameState.currentQuestionIndex,
      isCorrect,
      timeTakenSeconds: timeTaken,
    };
    setTimeout(() => {
      setGameState(prev => ({
        ...prev,
        stage: AppStage.FEEDBACK,
        results: [...prev.results, newResult]
      }));
    }, 400);
  };

  const nextQuestion = async () => {
    setSelectedAnswer(null);
    if (gameState.currentQuestionIndex + 1 >= TOTAL_QUESTIONS) {
      setGameState(prev => ({ ...prev, stage: AppStage.ANALYZING }));
      try {
        const advice = await generateAdvice(gameState.questions, gameState.results);
        setGameState(prev => ({ ...prev, advice, stage: AppStage.SUMMARY }));
      } catch (e) {
        setGameState(prev => ({ ...prev, stage: AppStage.SUMMARY }));
      }
    } else {
      setGameState(prev => ({
        ...prev,
        stage: AppStage.PLAYING,
        currentQuestionIndex: prev.currentQuestionIndex + 1
      }));
      setStartTime(Date.now());
    }
  };

  const renderTitle = () => {
    const isQuizMode = gameState.mode === GameMode.QUIZ;

    return (
      <div className="min-h-screen w-screen flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* 左側：設定パネル */}
        <div className="w-full lg:w-[450px] bg-stone-900/10 backdrop-blur-xl border-b-8 lg:border-b-0 lg:border-r-8 border-white/20 p-6 lg:p-10 flex flex-col gap-6 lg:gap-10 shrink-0">
          <div className="flex items-center text-white">
            <h1 className="text-3xl lg:text-5xl font-black drop-shadow-md tracking-wider">SETTING</h1>
          </div>

          <div className="flex lg:flex-col gap-6 lg:gap-8 overflow-x-auto lg:overflow-y-auto no-scrollbar lg:custom-scrollbar pb-2 lg:pb-0">
            {/* モード選択 */}
            <div className="space-y-4 shrink-0 lg:shrink">
              <label className="text-white text-xl lg:text-2xl font-black block ml-2">モード</label>
              <div className="flex lg:flex-col gap-3 lg:gap-4">
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, mode: GameMode.STUDY }))}
                  className={`p-4 lg:p-6 rounded-2xl lg:rounded-3xl transition-all border-4 flex items-center gap-3 lg:gap-4 ${gameState.mode === GameMode.STUDY ? 'bg-white border-yellow-400 shadow-[0_6px_0_#ca8a04]' : 'bg-white/10 border-transparent text-white/60 hover:bg-white/20'}`}
                >
                  <BookOpen className={`w-8 h-8 lg:w-10 lg:h-10 ${gameState.mode === GameMode.STUDY ? 'text-sky-500' : ''}`} />
                  <span className={`text-xl lg:text-3xl font-black whitespace-nowrap ${gameState.mode === GameMode.STUDY ? 'text-stone-700' : ''}`}>べんきょう</span>
                </button>
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, mode: GameMode.QUIZ }))}
                  className={`p-4 lg:p-6 rounded-2xl lg:rounded-3xl transition-all border-4 flex items-center gap-3 lg:gap-4 ${gameState.mode === GameMode.QUIZ ? 'bg-white border-yellow-400 shadow-[0_6px_0_#ca8a04]' : 'bg-white/10 border-transparent text-white/60 hover:bg-white/20'}`}
                >
                  <Star className={`w-8 h-8 lg:w-10 lg:h-10 ${gameState.mode === GameMode.QUIZ ? 'text-yellow-500' : ''}`} />
                  <span className={`text-xl lg:text-3xl font-black whitespace-nowrap ${gameState.mode === GameMode.QUIZ ? 'text-stone-700' : ''}`}>クイズ</span>
                </button>
              </div>
            </div>

            {/* 先生選択 */}
            <div className={`space-y-4 shrink-0 lg:shrink transition-all duration-300 ${isQuizMode ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center ml-2">
                <label className="text-white text-xl lg:text-2xl font-black">先生</label>
              </div>
              <div className="flex lg:flex-col gap-3 lg:gap-4">
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, teacher: TeacherType.SUNAO }))}
                  className={`p-4 lg:p-6 rounded-2xl lg:rounded-3xl transition-all border-4 text-left ${gameState.teacher === TeacherType.SUNAO ? 'bg-sky-400 border-white text-white shadow-[0_6px_0_#0369a1]' : 'bg-white/10 border-transparent text-white/60'}`}
                >
                  <span className="text-xl lg:text-3xl font-black whitespace-nowrap">すなお先生</span>
                </button>
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, teacher: TeacherType.AMANO }))}
                  className={`p-4 lg:p-6 rounded-2xl lg:rounded-3xl transition-all border-4 text-left ${gameState.teacher === TeacherType.AMANO ? 'bg-purple-500 border-white text-white shadow-[0_6px_0_#6b21a8]' : 'bg-white/10 border-transparent text-white/60'}`}
                >
                  <span className="text-xl lg:text-3xl font-black whitespace-nowrap">あまの先生</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：メインコンテンツ */}
        <div className="flex-1 flex flex-col p-6 lg:p-12 gap-6 lg:gap-8 min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
            <h2 className="text-4xl lg:text-6xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.2)] uppercase">Upload Content</h2>
            <div className="bg-white/20 backdrop-blur rounded-xl lg:rounded-2xl px-4 lg:px-6 py-2 lg:py-3 border-2 border-white/20 text-white font-black text-sm lg:text-base">
                MAX 10 IMAGES
            </div>
          </div>

          {/* 画像アップロードエリア */}
          <div className="flex-1 relative glossy-card rounded-[2rem] lg:rounded-[4rem] border-4 lg:border-8 border-white overflow-hidden group min-h-[300px] lg:min-h-0">
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleImageUpload} 
              className="absolute inset-0 opacity-0 z-30 cursor-pointer" 
            />
            
            {gameState.images.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 lg:p-12 text-center pointer-events-none">
                 <div className="w-24 h-24 lg:w-40 h-40 bg-sky-100 rounded-full flex items-center justify-center mb-4 lg:mb-6 border-4 lg:border-8 border-sky-50 group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-12 h-12 lg:w-20 lg:h-20 text-sky-500" />
                 </div>
                 <p className="text-3xl lg:text-5xl font-black text-stone-700 mb-2">写真をえらんでね！</p>
                 <p className="text-lg lg:text-2xl font-bold text-stone-400">教科書やプリントをセットしよう</p>
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full bg-stone-100">
                  <img 
                    src={URL.createObjectURL(gameState.images[0])} 
                    className="absolute inset-0 w-full h-full object-cover blur-sm opacity-40"
                    alt="Preview Background"
                  />
                  
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                     <div className="bg-white/90 p-8 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl border-4 lg:border-8 border-sky-400 flex flex-col items-center gap-2 lg:gap-4 transform scale-90 lg:scale-110">
                        <span className="text-[6rem] lg:text-[10rem] leading-none font-black text-stone-800 tabular-nums">
                          {gameState.images.length}
                        </span>
                        <span className="text-2xl lg:text-4xl font-black text-sky-500 uppercase tracking-widest">Images Set</span>
                     </div>
                  </div>

                  <div className="absolute bottom-4 lg:bottom-6 left-0 right-0 flex justify-center gap-2 lg:gap-3 px-4 lg:px-6 z-20 overflow-x-auto py-2 lg:py-4 pointer-events-none no-scrollbar">
                      {gameState.images.map((img, i) => (
                         <div key={i} className="w-14 h-14 lg:w-20 lg:h-20 rounded-xl lg:rounded-2xl border-2 lg:border-4 border-white shadow-xl overflow-hidden shrink-0 transform hover:scale-110 transition-transform bg-white">
                             <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" alt={`Preview ${i}`} />
                         </div>
                      ))}
                  </div>
              </div>
            )}
          </div>

          {/* フッターアクションエリア */}
          <div className="flex flex-col sm:flex-row justify-end items-center gap-6 lg:gap-12 shrink-0">
             {gameState.images.length > 0 && (
               <p className="text-white text-xl lg:text-3xl font-black animate-bounce">OK! 準備ができたよ！ →</p>
             )}
             <Button 
                variant="game-orange" 
                size="xl" 
                onClick={startGeneration} 
                disabled={gameState.images.length === 0}
                className={`w-full lg:max-w-[600px] rounded-full text-3xl lg:text-5xl py-6 lg:py-10 ${gameState.images.length > 0 ? 'animate-pulse' : ''}`}
              >
                START! <ChevronRight className="w-10 h-10 lg:w-16 lg:h-16" />
              </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderPlaying = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="h-screen w-screen flex flex-col p-6 lg:p-12 relative overflow-hidden">
        {/* ヘッダーエリアに中断ボタンを統合 */}
        <div className="flex items-center gap-4 lg:gap-8 mb-4 lg:mb-8 shrink-0">
          <Button variant="pill-black" size="sm" onClick={backToTitle} className="px-4 py-2 text-sm sm:text-lg lg:text-2xl shrink-0 h-12 sm:h-16 lg:h-20 border-2">
            <ArrowLeft className="w-4 h-4 sm:w-6 sm:h-6 lg:w-8 lg:h-8" /> 中断
          </Button>
          <ProgressBar current={gameState.currentQuestionIndex + 1} total={TOTAL_QUESTIONS} className="flex-1" />
        </div>
        
        <div className="flex-1 glossy-card rounded-[2.5rem] lg:rounded-[5rem] p-6 lg:p-12 flex items-center justify-center text-center mb-6 lg:mb-10 border-4 lg:border-8 border-white/80 min-h-0 overflow-y-auto">
          <h2 className="text-3xl sm:text-5xl lg:text-8xl font-black text-stone-800 leading-tight break-words px-4">
            {question.question}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-8 h-auto sm:h-[35%] shrink-0 pb-4 sm:pb-0">
          {question.options.map((option, idx) => (
            <Button
              key={idx}
              variant="game-white"
              onClick={() => handleAnswer(idx)}
              className="h-16 sm:h-full text-xl sm:text-3xl lg:text-4xl rounded-[1.5rem] lg:rounded-[3.5rem] border-4 lg:border-8 border-sky-100 hover:border-sky-300 px-4 lg:px-8"
            >
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-sky-500 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl mr-2 lg:mr-4 shrink-0">
                {['A', 'B', 'C', 'D'][idx]}
              </div>
              <span className="line-clamp-1 sm:line-clamp-2">{option}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const renderFeedback = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    const isCorrect = gameState.results[gameState.results.length - 1].isCorrect;
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center p-6 lg:p-12 transition-colors duration-500 ${isCorrect ? 'bg-teal-500' : 'bg-rose-500'}`}>
        <div className="w-full max-w-6xl glossy-card rounded-[3rem] lg:rounded-[5rem] overflow-hidden border-4 lg:border-8 border-white p-8 lg:p-16 flex flex-col h-full shadow-2xl">
          <div className="text-center mb-4 lg:mb-6 shrink-0">
            <h2 className={`text-5xl sm:text-[8rem] lg:text-[10rem] font-black leading-none drop-shadow-xl ${isCorrect ? 'text-teal-400' : 'text-rose-400'}`}>
              {isCorrect ? 'SUCCESS!' : 'MISS...'}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 lg:space-y-8 pr-2 lg:pr-4 custom-scrollbar mb-4">
            {!isCorrect && (
              <div className="bg-rose-50 p-6 lg:p-10 rounded-[2rem] lg:rounded-[3.5rem] text-center border-4 border-rose-200 shadow-inner">
                <p className="text-xl lg:text-2xl text-rose-500 font-black mb-1 lg:mb-2 uppercase tracking-widest">Correct Answer</p>
                <p className="text-3xl lg:text-5xl font-black text-stone-800">{question.options[question.correctAnswerIndex]}</p>
              </div>
            )}
            <div className="bg-white/50 p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] border-4 border-white/80 shadow-inner">
              <p className="text-stone-800 text-2xl lg:text-5xl font-black leading-relaxed">
                {question.explanation}
              </p>
            </div>
          </div>

          <div className="mt-auto flex justify-end shrink-0">
            <Button 
              variant="game-orange" 
              size="xl" 
              onClick={nextQuestion}
              className="w-full rounded-full py-4 lg:py-8 text-2xl lg:text-4xl"
            >
              {gameState.currentQuestionIndex + 1 >= TOTAL_QUESTIONS ? "結果をみる" : "つぎへ！"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const correctCount = gameState.results.filter(r => r.isCorrect).length;
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-6 lg:p-12 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-6xl text-center py-10 lg:py-0">
          <h1 className="text-5xl sm:text-[8rem] lg:text-[10rem] font-black text-white drop-shadow-[0_8px_0_rgba(0,0,0,0.3)] leading-none mb-8 lg:mb-10 uppercase italic">
            Course Clear!
          </h1>

          <div className="glossy-card rounded-[3.5rem] lg:rounded-[6rem] border-4 lg:border-8 border-white p-8 lg:p-16 flex flex-col items-center mb-8 lg:mb-12 shadow-2xl">
             <div className="flex items-center gap-6 lg:gap-12">
                <Star className="w-16 h-16 lg:w-40 lg:h-40 text-yellow-400 drop-shadow-lg animate-pulse" />
                <div className="text-[6rem] sm:text-[12rem] lg:text-[18rem] font-black text-stone-800 leading-none tracking-tighter tabular-nums">
                  {correctCount}<span className="text-[2.5rem] lg:text-[7rem] text-stone-300 ml-2 lg:ml-4">/10</span>
                </div>
                <Star className="w-16 h-16 lg:w-40 lg:h-40 text-yellow-400 drop-shadow-lg animate-pulse" />
             </div>
             {gameState.advice && (
               <div className="bg-sky-50 p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] mt-6 lg:mt-8 border-2 lg:border-4 border-sky-100 italic font-bold text-xl lg:text-3xl text-stone-600 shadow-inner max-w-4xl">
                 "{gameState.advice}"
               </div>
             )}
          </div>

          <Button 
            variant="game-yellow" 
            size="xl" 
            onClick={backToTitle} 
            className="w-full max-w-4xl mx-auto rounded-full text-2xl lg:text-4xl py-6 lg:py-10"
          >
            タイトルにもどる
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen select-none relative overflow-hidden">
      <ApiStatus />
      <Modal isOpen={modalState.isOpen} onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))} title={modalState.title} message={modalState.message} type={modalState.type} />
      {gameState.stage === AppStage.TITLE && renderTitle()}
      {gameState.stage === AppStage.GENERATING && (
        <div className="h-screen w-screen flex flex-col items-center justify-center text-white p-6 lg:p-12">
          <div className="relative">
            <Loader2 className="w-32 h-32 lg:w-48 lg:h-48 animate-spin mb-8 lg:mb-12 text-yellow-300" />
            <div className="absolute inset-0 flex items-center justify-center">
               <BookOpen className="w-10 h-10 lg:w-16 lg:h-16 text-white" />
            </div>
          </div>
          <p className="text-4xl lg:text-8xl font-black drop-shadow-lg text-center leading-tight">
            {gameState.loadingMessage}
          </p>
        </div>
      )}
      {gameState.stage === AppStage.PLAYING && renderPlaying()}
      {gameState.stage === AppStage.FEEDBACK && renderFeedback()}
      {gameState.stage === AppStage.ANALYZING && (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-teal-500 text-white p-6 lg:p-12">
           <Star className="w-32 h-32 lg:w-48 lg:h-48 animate-bounce mb-8 lg:mb-12 text-yellow-300" />
           <p className="text-5xl lg:text-8xl font-black">集計中...</p>
        </div>
      )}
      {gameState.stage === AppStage.SUMMARY && renderSummary()}
    </div>
  );
};

export default App;

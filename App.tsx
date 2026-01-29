
import React, { useState, useEffect, useMemo } from 'react';
import { Upload, ChevronRight, ArrowLeft, Loader2, Star, BookOpen, Trophy, Info, Target } from 'lucide-react';
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

  // 画像プレビュー用のURL管理（メモリリーク防止）
  const imageUrls = useMemo(() => {
    return gameState.images.map(file => URL.createObjectURL(file));
  }, [gameState.images]);

  useEffect(() => {
    return () => {
      imageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageUrls]);

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
    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, loadingMessage: "準備中..." }));
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
      console.error(error);
      setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
      showModal('エラー', "クイズを作れませんでした。画像をかえて試してみてね。", 'error');
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
    }, 600);
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

  const renderTitle = () => (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-y-auto no-scrollbar">
      {/* Sidebar Setting Section */}
      <div className="w-full lg:w-[580px] bg-stone-900/20 backdrop-blur-2xl p-8 lg:p-14 flex flex-col gap-12 shrink-0 border-b-4 lg:border-b-0 lg:border-r-8 border-white/20 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          <span className="text-white font-black opacity-50 text-xl tracking-widest uppercase italic">Config</span>
          <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]">設定</h1>
        </div>
        
        <div className="flex lg:flex-col gap-12">
          {/* Game Mode Section */}
          <div className="space-y-6 shrink-0 lg:shrink w-full">
            <label className="text-white text-xl font-black opacity-90 uppercase tracking-[0.2em] block ml-4">Game Mode</label>
            <div className="grid grid-cols-1 gap-8">
              {[GameMode.STUDY, GameMode.QUIZ].map((m) => (
                <button
                  key={m}
                  onClick={() => setGameState(prev => ({ ...prev, mode: m }))}
                  className={`flex items-center gap-8 p-8 lg:p-10 rounded-[3rem] border-[8px] transition-all transform active:scale-95 ${gameState.mode === m ? 'bg-white border-yellow-400 text-stone-800 shadow-[0_16px_0_#ca8a04]' : 'bg-white/25 border-white/10 text-white hover:bg-white/35'}`}
                >
                  <div className={`p-4 rounded-3xl ${gameState.mode === m ? 'bg-yellow-100 shadow-inner' : 'bg-white/10'}`}>
                    {m === GameMode.STUDY ? <BookOpen size={60} className={gameState.mode === m ? 'text-sky-600' : 'text-white/60'} /> : <Star size={60} className={gameState.mode === m ? 'text-yellow-600' : 'text-white/60'} />}
                  </div>
                  <span className="font-black text-4xl lg:text-6xl">{m === GameMode.STUDY ? 'べんきょう' : 'クイズ'}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Teacher Section */}
          <div className={`space-y-6 shrink-0 lg:shrink w-full transition-all duration-300 ${gameState.mode === GameMode.QUIZ ? 'opacity-40 grayscale-[0.3] pointer-events-none' : ''}`}>
            <label className="text-white text-xl font-black opacity-90 uppercase tracking-[0.2em] block ml-4">Teacher Type</label>
            <div className="grid grid-cols-1 gap-8">
              {[TeacherType.SUNAO, TeacherType.AMANO].map((t) => (
                <button
                  key={t}
                  onClick={() => setGameState(prev => ({ ...prev, teacher: t }))}
                  className={`flex items-center gap-8 p-8 lg:p-10 rounded-[3rem] border-[8px] text-left transition-all transform active:scale-95 ${gameState.teacher === t ? 'bg-sky-400 border-white text-white shadow-[0_16px_0_#0369a1]' : 'bg-white/25 border-white/10 text-white hover:bg-white/35'}`}
                >
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-4xl ${gameState.teacher === t ? 'bg-white text-sky-500 shadow-lg' : 'bg-white/10 text-white/50'}`}>
                    {t === TeacherType.SUNAO ? 'S' : 'A'}
                  </div>
                  <span className="font-black text-3xl lg:text-5xl tracking-tight">{t === TeacherType.SUNAO ? 'すなお先生' : 'あまの先生'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-8 lg:p-16 gap-10">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
             <span className="text-white font-black opacity-50 text-2xl tracking-widest uppercase italic">Import</span>
             <h2 className="text-5xl lg:text-8xl font-black text-white drop-shadow-[0_6px_0_rgba(0,0,0,0.2)]">写真を追加</h2>
          </div>
          <span className="text-white font-black opacity-70 text-2xl italic tracking-tighter">10 IMAGES MAX</span>
        </div>

        <div className="flex-1 min-h-[400px] relative glossy-card rounded-[4rem] lg:rounded-[6rem] border-4 lg:border-[12px] border-white group overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)]">
          <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 z-10 cursor-pointer" />
          {gameState.images.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center pointer-events-none">
              <Upload className="w-24 h-24 lg:w-40 lg:h-40 text-sky-500 mb-8" />
              <p className="text-4xl lg:text-6xl font-black text-stone-700 tracking-tight">写真をタップして選ぼう</p>
            </div>
          ) : (
            <div className="absolute inset-0 bg-stone-100 flex flex-col">
              <div className="flex-1 p-8 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-6 overflow-y-auto custom-scrollbar">
                {imageUrls.map((url, i) => (
                  <div key={i} className="aspect-square rounded-3xl border-8 border-white shadow-2xl overflow-hidden bg-white transform hover:scale-110 transition-transform">
                    <img src={url} className="w-full h-full object-cover" alt="preview" />
                  </div>
                ))}
              </div>
              <div className="bg-sky-500 p-8 text-center border-t-8 border-sky-600 shadow-2xl">
                <span className="text-white font-black text-3xl lg:text-4xl tracking-widest">{gameState.images.length} 枚セット完了！</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-10 justify-between shrink-0 px-4">
          <p className="text-white text-3xl font-black text-center sm:text-left drop-shadow-lg tracking-tight">準備ができたらスタート！</p>
          <Button 
            variant="game-orange" 
            size="xl" 
            onClick={startGeneration} 
            disabled={gameState.images.length === 0}
            className="w-full sm:w-auto px-24 rounded-full text-5xl lg:text-7xl py-12"
          >
            はじめる! <ChevronRight size={72} />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="h-full w-full flex flex-col p-4 sm:p-8 lg:p-12">
        <div className="flex items-center gap-4 mb-6 shrink-0">
          <Button variant="pill-black" size="sm" onClick={backToTitle} className="px-4 py-2 text-sm border-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <ProgressBar current={gameState.currentQuestionIndex + 1} total={TOTAL_QUESTIONS} className="flex-1" />
        </div>
        
        <div className="flex-1 bg-stone-900 border-8 border-stone-700 rounded-[2rem] lg:rounded-[4rem] p-6 lg:p-12 flex items-center justify-center text-center mb-6 shadow-inner overflow-hidden">
          <h2 className="text-2xl sm:text-4xl lg:text-6xl font-black text-white leading-tight break-words max-w-5xl">
            {question.question}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 h-auto sm:h-[40%] shrink-0">
          {question.options.map((option, idx) => (
            <Button
              key={idx}
              variant={selectedAnswer === idx ? (idx === question.correctAnswerIndex ? 'game-yellow' : 'danger') : 'game-white'}
              onClick={() => handleAnswer(idx)}
              className="h-full py-4 px-6 text-lg sm:text-2xl lg:text-3xl rounded-3xl lg:rounded-[3rem] border-4 flex items-center text-left justify-start"
            >
              <div className="w-10 h-10 lg:w-14 lg:h-14 bg-sky-500 rounded-full flex items-center justify-center text-white text-xl lg:text-2xl mr-4 shrink-0 shadow-lg">
                {['A', 'B', 'C', 'D'][idx]}
              </div>
              <span className="line-clamp-2">{option}</span>
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
      <div className={`h-full w-full flex flex-col items-center justify-center p-4 sm:p-10 transition-colors duration-500 ${isCorrect ? 'bg-teal-500' : 'bg-rose-500'}`}>
        <div className="w-full max-w-5xl glossy-card rounded-[3rem] lg:rounded-[5rem] overflow-hidden border-8 border-white/80 p-8 lg:p-16 flex flex-col h-full shadow-2xl">
          <div className="text-center mb-6 shrink-0">
            <h2 className={`text-6xl sm:text-8xl lg:text-[10rem] font-black italic leading-none drop-shadow-xl ${isCorrect ? 'text-teal-400' : 'text-rose-400'}`}>
              {isCorrect ? 'せいかい！' : 'ざんねん...'}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2 mb-8">
            <div className={`p-6 rounded-[2rem] border-4 ${isCorrect ? 'bg-teal-50 border-teal-200' : 'bg-rose-50 border-rose-200'}`}>
               <div className="flex items-center gap-2 mb-2 text-stone-400 uppercase font-black tracking-widest text-sm">
                 <Target size={20} /> 正しい答え
               </div>
               <p className="text-2xl sm:text-4xl font-black text-stone-800">{question.options[question.correctAnswerIndex]}</p>
            </div>
            
            <div className="bg-white/60 p-6 lg:p-10 rounded-[2.5rem] border-4 border-white shadow-inner">
               <div className="flex items-center gap-2 mb-4 text-sky-500 uppercase font-black tracking-widest text-sm">
                 <Info size={20} /> かいせつ
               </div>
               <p className="text-xl sm:text-3xl lg:text-4xl font-bold text-stone-700 leading-relaxed whitespace-pre-wrap">
                 {question.explanation}
               </p>
            </div>
          </div>

          <div className="mt-auto shrink-0">
            <Button variant="game-orange" size="xl" onClick={nextQuestion} className="w-full rounded-full py-6 text-2xl lg:text-4xl">
              {gameState.currentQuestionIndex + 1 >= TOTAL_QUESTIONS ? "結果を見る" : "つぎの問題へ"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const correctCount = gameState.results.filter(r => r.isCorrect).length;
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 lg:p-12 overflow-y-auto no-scrollbar">
        <div className="w-full max-w-4xl text-center py-10">
          <h1 className="text-5xl sm:text-8xl lg:text-9xl font-black text-white drop-shadow-[0_8px_0_rgba(0,0,0,0.3)] leading-none mb-10">
            コースクリア！
          </h1>

          <div className="glossy-card rounded-[4rem] border-8 border-white p-8 lg:p-16 flex flex-col items-center mb-12 shadow-2xl relative">
             <div className="absolute -top-12 -left-8 -rotate-12">
               <Trophy size={96} className="text-yellow-400 drop-shadow-lg" />
             </div>
             
             <div className="flex items-baseline gap-2">
                <span className="text-[10rem] sm:text-[15rem] font-black text-stone-800 leading-none tabular-nums tracking-tighter">{correctCount}</span>
                <span className="text-4xl sm:text-7xl font-black text-stone-300">/10</span>
             </div>
             
             <div className="mt-8 text-2xl sm:text-3xl font-black text-sky-600 uppercase tracking-widest">今回のスコア</div>

             {gameState.advice && (
               <div className="bg-sky-50 p-6 lg:p-8 rounded-[2.5rem] mt-10 border-4 border-sky-100 italic font-bold text-lg sm:text-2xl text-stone-600 shadow-inner w-full">
                 "{gameState.advice}"
               </div>
             )}
          </div>

          <Button variant="game-yellow" size="xl" onClick={backToTitle} className="w-full rounded-full py-8 text-2xl lg:text-4xl">
            もう一度あそぶ
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full select-none relative overflow-hidden">
      <ApiStatus />
      <Modal isOpen={modalState.isOpen} onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))} title={modalState.title} message={modalState.message} type={modalState.type} />
      
      <div className="h-full w-full transition-opacity duration-300">
        {gameState.stage === AppStage.TITLE && renderTitle()}
        {gameState.stage === AppStage.GENERATING && (
          <div className="h-full w-full flex flex-col items-center justify-center text-white p-10 text-center">
            <div className="relative mb-12">
              <Loader2 className="w-32 h-32 lg:w-48 lg:h-48 animate-spin text-yellow-300" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Upload className="w-12 h-12 lg:w-16 lg:h-16 text-white" />
              </div>
            </div>
            <p className="text-3xl sm:text-5xl lg:text-7xl font-black drop-shadow-lg animate-pulse">
              {gameState.loadingMessage}
            </p>
          </div>
        )}
        {gameState.stage === AppStage.PLAYING && renderPlaying()}
        {gameState.stage === AppStage.FEEDBACK && renderFeedback()}
        {gameState.stage === AppStage.ANALYZING && (
          <div className="h-full w-full flex flex-col items-center justify-center bg-teal-500 text-white p-10 text-center">
             <Trophy size={160} className="text-yellow-300 animate-bounce mb-12 drop-shadow-2xl" />
             <p className="text-5xl lg:text-8xl font-black">スコアを集計中...</p>
          </div>
        )}
        {gameState.stage === AppStage.SUMMARY && renderSummary()}
      </div>
    </div>
  );
};

export default App;

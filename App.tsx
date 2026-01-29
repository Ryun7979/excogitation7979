
import React, { useState, useEffect, useMemo } from 'react';
import { Upload, ChevronRight, ArrowLeft, Loader2, Star, BookOpen, Trophy, Info, Target, Sparkles } from 'lucide-react';
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

  const getOptionFontSizeClass = (text: string) => {
    if (text.length > 50) return 'text-sm sm:text-base lg:text-xl';
    if (text.length > 25) return 'text-lg sm:text-xl lg:text-3xl';
    return 'text-2xl sm:text-3xl lg:text-5xl';
  };

  const renderTitle = () => (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-full lg:w-2/5 lg:max-w-[440px] bg-stone-900/10 backdrop-blur-xl p-6 lg:p-10 flex flex-col gap-6 shrink-0 border-b-2 lg:border-b-0 lg:border-r-4 border-white/20 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          <span className="text-white font-black opacity-40 text-sm tracking-widest uppercase italic">Config</span>
          <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tighter drop-shadow-md">設定</h1>
        </div>
        
        <div className="flex flex-col gap-4 lg:gap-6">
          <div className="space-y-3">
            <label className="text-white text-[10px] font-black opacity-80 uppercase tracking-widest block ml-2">Game Mode</label>
            <div className="grid grid-cols-1 gap-3">
              {[GameMode.STUDY, GameMode.QUIZ].map((m) => (
                <button
                  key={m}
                  onClick={() => setGameState(prev => ({ ...prev, mode: m }))}
                  className={`flex items-center gap-4 lg:gap-6 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2rem] border-4 transition-all transform active:scale-95 ${gameState.mode === m ? 'bg-white border-yellow-400 text-stone-800 shadow-[0_6px_0_#ca8a04]' : 'bg-white/20 border-white/10 text-white hover:bg-white/30'}`}
                >
                  <div className={`p-2 lg:p-3 rounded-xl ${gameState.mode === m ? 'bg-yellow-100' : 'bg-white/10'}`}>
                    {m === GameMode.STUDY ? <BookOpen size={32} className={gameState.mode === m ? 'text-sky-600' : 'text-white/60'} /> : <Star size={32} className={gameState.mode === m ? 'text-yellow-600' : 'text-white/60'} />}
                  </div>
                  <span className="font-black text-xl lg:text-4xl">{m === GameMode.STUDY ? 'べんきょう' : 'クイズ'}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className={`space-y-3 transition-all duration-300 ${gameState.mode === GameMode.QUIZ ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
            <label className="text-white text-[10px] font-black opacity-80 uppercase tracking-widest block ml-2">Teacher Type</label>
            <div className="grid grid-cols-1 gap-3">
              {[TeacherType.SUNAO, TeacherType.AMANO].map((t) => (
                <button
                  key={t}
                  onClick={() => setGameState(prev => ({ ...prev, teacher: t }))}
                  className={`flex items-center gap-4 lg:gap-6 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2rem] border-4 text-left transition-all transform active:scale-95 ${gameState.teacher === t ? 'bg-sky-400 border-white text-white shadow-[0_6px_0_#0369a1]' : 'bg-white/20 border-white/10 text-white hover:bg-white/30'}`}
                >
                  <div className={`w-10 h-10 lg:w-16 lg:h-16 rounded-full flex items-center justify-center font-black text-lg lg:text-2xl ${gameState.teacher === t ? 'bg-white text-sky-500' : 'bg-white/10 text-white/50'}`}>
                    {t === TeacherType.SUNAO ? 'S' : 'A'}
                  </div>
                  <span className="font-black text-lg lg:text-3xl tracking-tight">{t === TeacherType.SUNAO ? 'すなお先生' : 'あまの先生'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 lg:p-12 gap-6 overflow-hidden">
        <div className="flex justify-between items-end shrink-0">
          <div className="space-y-1">
             <span className="text-white font-black opacity-40 text-lg tracking-widest uppercase italic">Import</span>
             <h2 className="text-3xl lg:text-7xl font-black text-white drop-shadow-sm leading-none">写真を追加</h2>
          </div>
          <span className="text-white font-black opacity-50 text-sm lg:text-xl italic">MAX 10</span>
        </div>

        {/* Input Card: Needs min-h-0 to allow scrolling inside if needed */}
        <div className="flex-1 min-h-0 relative glossy-card rounded-[2.5rem] lg:rounded-[5rem] border-4 lg:border-8 border-white group overflow-hidden shadow-2xl">
          <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 z-10 cursor-pointer" />
          {gameState.images.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
              <Upload className="w-16 h-16 lg:w-32 lg:h-32 text-sky-500 mb-4" />
              <p className="text-xl lg:text-5xl font-black text-stone-600">写真をえらんでね</p>
            </div>
          ) : (
            <div className="absolute inset-0 bg-stone-50 flex flex-col h-full">
              <div className="flex-1 p-4 lg:p-6 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 lg:gap-4 overflow-y-auto custom-scrollbar">
                {imageUrls.map((url, i) => (
                  <div key={i} className="aspect-square rounded-2xl lg:rounded-3xl border-2 lg:border-4 border-white shadow-lg overflow-hidden bg-white">
                    <img src={url} className="w-full h-full object-cover" alt="preview" />
                  </div>
                ))}
              </div>
              <div className="bg-sky-500 p-3 lg:p-5 text-center border-t-4 lg:border-t-8 border-sky-600 shadow-lg shrink-0">
                <span className="text-white font-black text-lg lg:text-3xl">{gameState.images.length} 枚セット完了！</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 justify-between shrink-0">
          <p className="text-white text-lg lg:text-3xl font-black text-center sm:text-left drop-shadow-md">準備ができたらスタート！</p>
          <Button 
            variant="game-orange" 
            size="lg" 
            onClick={startGeneration} 
            disabled={gameState.images.length === 0}
            className="w-full sm:w-auto px-10 lg:px-16 rounded-full"
          >
            はじめる! <ChevronRight size={32} className="lg:w-11 lg:h-11" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="flex flex-col h-full w-full p-4 lg:p-10 overflow-hidden bg-gradient-to-b from-sky-400 via-sky-100 to-white relative">
        <div className="absolute top-10 right-10 text-sky-300 opacity-20 pointer-events-none animate-pulse">
           <Sparkles size={120} />
        </div>
        
        <div className="flex items-center gap-4 lg:gap-6 mb-4 lg:mb-8 shrink-0 relative z-10">
          <Button variant="pill-black" size="sm" onClick={backToTitle} className="px-3 lg:px-4 py-1 lg:py-2 border-2 min-w-0 bg-white text-stone-800 shadow-[0_4px_0_#ccc]">
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
          </Button>
          <ProgressBar current={gameState.currentQuestionIndex + 1} total={TOTAL_QUESTIONS} className="flex-1" />
        </div>
        
        <div className="flex-1 min-h-0 bg-white/90 backdrop-blur-md border-4 lg:border-8 border-white rounded-[2.5rem] lg:rounded-[4rem] p-6 lg:p-12 flex items-center justify-center text-center mb-6 lg:mb-10 shadow-2xl overflow-y-auto custom-scrollbar relative z-10">
          <h2 className="text-xl sm:text-3xl lg:text-6xl font-black text-stone-800 leading-tight max-w-5xl">
            {question.question}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-8 shrink-0 pb-2 relative z-10">
          {question.options.map((option, idx) => (
            <Button
              key={idx}
              variant={selectedAnswer === idx ? (idx === question.correctAnswerIndex ? 'game-yellow' : 'danger') : 'game-white'}
              onClick={() => handleAnswer(idx)}
              className={`h-auto min-h-[70px] lg:min-h-[140px] py-2 lg:py-6 px-4 lg:px-10 rounded-[1.2rem] lg:rounded-[3rem] border-4 flex items-center text-left justify-start whitespace-normal transition-all active:scale-95 ${getOptionFontSizeClass(option)}`}
            >
              <div className="w-8 h-8 lg:w-16 lg:h-16 bg-sky-500 rounded-full flex items-center justify-center text-white text-sm lg:text-4xl mr-3 lg:mr-8 shrink-0 font-black shadow-lg">
                {['A', 'B', 'C', 'D'][idx]}
              </div>
              <span className="leading-tight break-words flex-1 font-black">{option}</span>
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
      <div className={`flex flex-col h-full w-full items-center p-4 lg:p-10 transition-colors duration-500 ${isCorrect ? 'bg-teal-500' : 'bg-rose-500'}`}>
        <div className="w-full max-w-5xl glossy-card rounded-[2.5rem] lg:rounded-[4rem] overflow-hidden border-4 lg:border-8 border-white/80 p-6 lg:p-10 flex flex-col h-full shadow-2xl">
          
          <div className="text-center mb-4 shrink-0 flex items-center justify-center gap-4">
             {isCorrect ? <Sparkles className="text-teal-400 w-8 h-8 lg:w-10 lg:h-10 animate-spin-slow" /> : null}
             <h2 className={`text-3xl sm:text-5xl lg:text-8xl font-black italic drop-shadow-lg ${isCorrect ? 'text-teal-400' : 'text-rose-400'}`}>
              {isCorrect ? 'せいかい！' : 'ざんねん...'}
            </h2>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4 lg:gap-6 mb-6">
            <div className={`p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2.5rem] border-4 shrink-0 ${isCorrect ? 'bg-teal-50 border-teal-200' : 'bg-rose-50 border-rose-200'}`}>
               <div className="flex items-center gap-2 mb-1 text-stone-400 uppercase font-black text-[10px] lg:text-sm tracking-widest">
                 <Target size={16} /> 正解
               </div>
               <p className="text-lg lg:text-5xl font-black text-stone-800 leading-tight">
                 {question.options[question.correctAnswerIndex]}
               </p>
            </div>
            
            <div className="flex-1 bg-white/60 p-5 lg:p-10 rounded-[1.5rem] lg:rounded-[3rem] border-4 border-white shadow-inner flex flex-col overflow-y-auto custom-scrollbar">
               <div className="flex items-center gap-2 mb-2 lg:mb-4 text-sky-500 uppercase font-black text-[10px] lg:text-sm tracking-widest">
                 <Info size={20} /> かいせつ
               </div>
               <p className="text-lg lg:text-4xl font-bold text-stone-700 leading-relaxed whitespace-pre-wrap">
                 {question.explanation}
               </p>
            </div>
          </div>

          <div className="mt-auto shrink-0">
             <Button variant="game-orange" size="lg" onClick={nextQuestion} className="w-full rounded-full py-4 lg:py-8 text-xl lg:text-5xl">
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
      <div className="flex flex-col h-full w-full items-center justify-center p-4 lg:p-12 overflow-hidden bg-gradient-to-br from-sky-400 to-indigo-500">
        <div className="w-full max-w-4xl text-center flex flex-col h-full">
          <h1 className="text-4xl lg:text-[9rem] font-black text-white drop-shadow-xl leading-none mb-4 lg:mb-6 shrink-0 italic">
            クリア！
          </h1>

          <div className="flex-1 min-h-0 bg-white/90 backdrop-blur-md rounded-[2.5rem] lg:rounded-[5rem] border-4 lg:border-12 border-white p-6 lg:p-12 flex flex-col items-center justify-center mb-6 lg:mb-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={200} /></div>
             
             <div className="flex items-baseline gap-2 shrink-0 relative z-10">
                <span className="text-[6rem] lg:text-[15rem] font-black text-stone-800 leading-none tabular-nums tracking-tighter">{correctCount}</span>
                <span className="text-2xl lg:text-[5rem] font-black text-stone-300">/10</span>
             </div>
             
             <div className="mt-2 text-lg lg:text-4xl font-black text-sky-600 uppercase tracking-widest shrink-0 relative z-10">今回のスコア</div>

             {gameState.advice && (
               <div className="bg-sky-50/80 p-5 lg:p-10 rounded-[1.5rem] lg:rounded-[3rem] mt-4 lg:mt-6 border-4 border-sky-100 italic font-black text-base lg:text-4xl text-stone-600 shadow-inner w-full flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center text-center">
                 "{gameState.advice}"
               </div>
             )}
          </div>

          <Button variant="game-yellow" size="xl" onClick={backToTitle} className="w-full rounded-full py-5 lg:py-10 shrink-0">
            もう一度あそぶ
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full select-none relative overflow-hidden bg-gradient-to-br from-[#4facfe] to-[#00f2fe]">
      <ApiStatus />
      <Modal isOpen={modalState.isOpen} onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))} title={modalState.title} message={modalState.message} type={modalState.type} />
      
      <div className="h-full w-full flex flex-col">
        {gameState.stage === AppStage.TITLE && renderTitle()}
        {gameState.stage === AppStage.GENERATING && (
          <div className="flex flex-col h-full w-full items-center justify-center text-white p-8 text-center bg-black/50 backdrop-blur-lg">
            <div className="relative mb-8 lg:mb-12">
              <Loader2 className="w-20 h-20 lg:w-48 lg:h-48 animate-spin text-yellow-300" />
            </div>
            <p className="text-2xl lg:text-8xl font-black drop-shadow-xl animate-pulse uppercase italic">
              {gameState.loadingMessage}
            </p>
          </div>
        )}
        {gameState.stage === AppStage.PLAYING && renderPlaying()}
        {gameState.stage === AppStage.FEEDBACK && renderFeedback()}
        {gameState.stage === AppStage.ANALYZING && (
          <div className="flex flex-col h-full w-full items-center justify-center bg-teal-500 text-white p-8 text-center">
             <Trophy size={120} className="text-yellow-300 animate-bounce mb-8 lg:mb-12 lg:w-40 lg:h-40" />
             <p className="text-3xl lg:text-7xl font-black italic uppercase">集計中...</p>
          </div>
        )}
        {gameState.stage === AppStage.SUMMARY && renderSummary()}
      </div>
    </div>
  );
};

export default App;

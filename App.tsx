import React, { useState } from 'react';
import { Upload, Play, RefreshCw, CheckCircle, XCircle, Clock, Award, Image as ImageIcon, Loader2, Star, Sparkles, BookOpen, Crown, Smile, Frown, ThumbsUp, UserRound, UserCog, Zap } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AppStage, GameState, QuizResult, TOTAL_QUESTIONS, GameMode, TeacherType } from './types';
import { generateQuizFromImages, generateAdvice, generateDetailedExplanation } from './services/geminiService';
import { Button } from './components/Button';
import { ProgressBar } from './components/ProgressBar';
import { Modal } from './components/Modal';
import { ApiStatus } from './components/ApiStatus';

const MAX_IMAGES = 10;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    stage: AppStage.TITLE,
    mode: GameMode.STUDY,
    teacher: TeacherType.SUNAO, // Default teacher
    images: [],
    questions: [],
    currentQuestionIndex: 0,
    results: [],
  });

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Detailed Explanation State
  const [detailedExplanation, setDetailedExplanation] = useState<string | undefined>(undefined);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  
  // Modal State
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'info' | 'success' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showModal = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };
  
  // Handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files as FileList);
      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `一度にアップロードできる画像は${MAX_IMAGES}枚までです。\n数を減らしてもう一度選んでください。`, 'error');
        e.target.value = ''; // Reset input to allow retrying
        return;
      }
      setGameState(prev => ({
        ...prev,
        images: files
      }));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(file => file.type.startsWith('image/'));
      
      if (files.length === 0) {
        showModal('ファイル形式エラー', '画像ファイル（jpg, pngなど）のみドロップできます。', 'error');
        return;
      }

      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `一度にアップロードできる画像は${MAX_IMAGES}枚までです。\n数を減らしてもう一度選んでください。`, 'error');
        return;
      }

      setGameState(prev => ({
        ...prev,
        images: files
      }));
    }
  };

  const setGameMode = (mode: GameMode) => {
    setGameState(prev => ({ ...prev, mode }));
  };

  const setTeacher = (teacher: TeacherType) => {
    setGameState(prev => ({ ...prev, teacher }));
  };

  const updateLoadingMessage = (message: string) => {
    setGameState(prev => ({ ...prev, loadingMessage: message }));
  };

  const startGeneration = async () => {
    if (gameState.images.length === 0) {
        showModal('画像がありません', 'まずは画像を1枚以上選んでください！', 'error');
        return;
    }

    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, errorMessage: undefined, loadingMessage: "準備中..." }));

    try {
      const questions = await generateQuizFromImages(
        gameState.images, 
        gameState.mode,
        gameState.teacher,
        updateLoadingMessage
      );
      
      setGameState(prev => ({
        ...prev,
        questions,
        stage: AppStage.PLAYING,
        currentQuestionIndex: 0,
        results: [],
        advice: undefined,
      }));
      setStartTime(Date.now());
    } catch (error: any) {
      setGameState(prev => ({
        ...prev,
        stage: AppStage.TITLE,
      }));
      
      const isQuotaError = error.message?.includes('休憩') || error.message?.includes('混み合って');
      const title = isQuotaError ? '休憩しよう！' : 'エラーが発生しました';
      
      showModal(title, error.message || "問題の生成に失敗しました。", 'error');
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (selectedAnswer !== null) return; 
    
    // Check if current question already has a cached detailed explanation
    // But initially, we want to clear the *displayed* explanation until requested
    setDetailedExplanation(undefined);
    setIsExplaining(false);

    setSelectedAnswer(optionIndex);
    const endTime = Date.now();
    const timeTaken = (endTime - startTime) / 1000;
    
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
    const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;

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
    }, 800);
  };

  const handleExplain = async () => {
    const question = gameState.questions[gameState.currentQuestionIndex];

    // --- CACHING LOGIC ---
    // If we already fetched explanation for this question, use it!
    if (question.detailedExplanation) {
        setDetailedExplanation(question.detailedExplanation);
        return;
    }

    setIsExplaining(true);
    try {
      const explanation = await generateDetailedExplanation(question);
      setDetailedExplanation(explanation);
      
      // Save it back to the question object
      question.detailedExplanation = explanation;

    } catch (error) {
      showModal('エラー', '解説の作成に失敗しました。もう一度試してね。', 'error');
    } finally {
      setIsExplaining(false);
    }
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

  const replayWithSameImages = async () => {
     setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, errorMessage: undefined, loadingMessage: "復習問題を構成中..." }));
     try {
       const questions = await generateQuizFromImages(
         gameState.images, 
         gameState.mode, 
         gameState.teacher,
         updateLoadingMessage,
         gameState.questions, 
         gameState.results
       );
       
       setGameState(prev => ({
         ...prev,
         questions,
         stage: AppStage.PLAYING,
         currentQuestionIndex: 0,
         results: [],
         advice: undefined,
       }));
       setStartTime(Date.now());
     } catch (error: any) {
        setGameState(prev => ({
          ...prev,
          stage: AppStage.SUMMARY,
        }));
        
        const isQuotaError = error.message?.includes('休憩') || error.message?.includes('混み合って');
        const title = isQuotaError ? '休憩しよう！' : '再生成エラー';
        
        showModal(title, error.message || "問題の再生成に失敗しました。", 'error');
     }
  };

  const backToTitle = () => {
    setDetailedExplanation(undefined);
    setIsExplaining(false);
    setGameState(prev => ({
      stage: AppStage.TITLE,
      mode: prev.mode,
      teacher: prev.teacher,
      images: [],
      questions: [],
      currentQuestionIndex: 0,
      results: [],
      advice: undefined,
    }));
    setSelectedAnswer(null);
  };

  // --- Render Functions ---

  const renderTitle = () => (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 bg-yellow-400 overflow-hidden font-sans">
      <ApiStatus />
      <div className="relative w-full max-w-xl bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl text-center border-4 border-white z-10">
        <div className="mb-6">
            <span className="inline-block px-6 py-2 rounded-full bg-sky-100 text-sky-500 font-bold mb-4 tracking-wider text-xl">AI QUIZ GAME</span>
            <h1 className="text-6xl md:text-8xl font-black text-stone-800 drop-shadow-sm leading-tight tracking-tight">
            Four<br/>Choices
            </h1>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
           <button 
             onClick={() => setGameMode(GameMode.QUIZ)}
             className={`p-4 rounded-2xl border-4 transition-all duration-200 flex flex-col items-center gap-2 active:scale-95 ${
               gameState.mode === GameMode.QUIZ 
               ? 'bg-yellow-100 border-yellow-400 scale-105 shadow-md' 
               : 'bg-stone-50 border-transparent text-stone-400 hover:bg-stone-100'
             }`}
           >
              <Sparkles className={`w-8 h-8 ${gameState.mode === GameMode.QUIZ ? 'text-yellow-500 fill-yellow-500' : 'text-stone-300'}`} />
              <div className="font-black text-lg text-stone-700">クイズ</div>
              <div className="text-xs font-bold text-stone-500">雑学・トリビア</div>
           </button>

           <button 
             onClick={() => setGameMode(GameMode.STUDY)}
             className={`p-4 rounded-2xl border-4 transition-all duration-200 flex flex-col items-center gap-2 active:scale-95 ${
               gameState.mode === GameMode.STUDY 
               ? 'bg-sky-100 border-sky-400 scale-105 shadow-md' 
               : 'bg-stone-50 border-transparent text-stone-400 hover:bg-stone-100'
             }`}
           >
              <BookOpen className={`w-8 h-8 ${gameState.mode === GameMode.STUDY ? 'text-sky-500' : 'text-stone-300'}`} />
              <div className="font-black text-lg text-stone-700">勉強</div>
              <div className="text-xs font-bold text-stone-500">テスト対策</div>
           </button>
        </div>

        {gameState.mode === GameMode.STUDY && (
           <div className="bg-stone-50 p-4 rounded-2xl border-2 border-stone-200 mb-8">
              <div className="text-stone-500 font-bold text-sm mb-3 text-left pl-1">出題する先生を選んでね</div>
              <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setTeacher(TeacherType.SUNAO)}
                    className={`p-3 rounded-xl border-4 transition-all duration-200 flex flex-col items-center gap-2 active:scale-95 ${
                      gameState.teacher === TeacherType.SUNAO
                      ? 'bg-white border-sky-400 shadow-[0_4px_0_rgb(56,189,248)] -translate-y-1' 
                      : 'bg-white border-transparent text-stone-400 shadow-sm hover:bg-stone-50'
                    }`}
                  >
                     <div className="p-2 bg-sky-100 rounded-full text-sky-500">
                         <UserRound className="w-6 h-6" />
                     </div>
                     <div>
                        <div className="font-black text-base text-stone-700">すなお先生</div>
                        <div className="text-[10px] font-bold text-stone-400">基本通り忠実に</div>
                     </div>
                  </button>

                  <button 
                    onClick={() => setTeacher(TeacherType.AMANO)}
                    className={`p-3 rounded-xl border-4 transition-all duration-200 flex flex-col items-center gap-2 active:scale-95 ${
                      gameState.teacher === TeacherType.AMANO
                      ? 'bg-white border-purple-400 shadow-[0_4px_0_rgb(192,132,252)] -translate-y-1' 
                      : 'bg-white border-transparent text-stone-400 shadow-sm hover:bg-stone-50'
                    }`}
                  >
                     <div className="p-2 bg-purple-100 rounded-full text-purple-500">
                         <Zap className="w-6 h-6" />
                     </div>
                     <div>
                        <div className="font-black text-base text-stone-700">あまの先生</div>
                        <div className="text-[10px] font-bold text-stone-400">アレンジ・応用</div>
                     </div>
                  </button>
              </div>
           </div>
        )}
        
        {gameState.mode !== GameMode.STUDY && <div className="mb-8"></div>}

        <div className="relative group mb-8">
          <div 
             onDragOver={handleDragOver}
             onDragLeave={handleDragLeave}
             onDrop={handleDrop}
             className={`rounded-[2rem] border-4 border-dashed p-6 transition-all cursor-pointer overflow-hidden ${
                isDragging 
                  ? 'border-sky-500 bg-sky-100 scale-105 shadow-xl' 
                  : 'bg-stone-50 border-stone-300 hover:border-sky-400 hover:bg-sky-50'
             }`}
          >
             <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              
              <div className="flex flex-col items-center justify-center min-h-[140px]">
                {gameState.images.length === 0 ? (
                    <>
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 text-white shadow-[0_4px_0_rgb(14,165,233)] transition-transform duration-200 ${isDragging ? 'bg-sky-500 scale-110' : 'bg-sky-400 group-hover:scale-110'}`}>
                            <Upload className="w-10 h-10" strokeWidth={3} />
                        </div>
                        <p className={`text-xl font-bold ${isDragging ? 'text-sky-600' : 'text-stone-600'}`}>
                           {isDragging ? 'ドロップして追加！' : '画像をえらんでね！'}
                        </p>
                        <p className="text-stone-400 font-bold mt-1 text-base">（ドラッグ＆ドロップもOK）</p>
                    </>
                ) : (
                    <>
                        <div className="flex -space-x-4 mb-4 overflow-x-auto py-2 px-4 max-w-full no-scrollbar">
                        {gameState.images.slice(0, 5).map((img, i) => (
                            <div key={i} className="flex-shrink-0 w-20 h-20 rounded-2xl border-4 border-white overflow-hidden shadow-lg relative bg-stone-200 rotate-3 even:-rotate-3">
                            <img 
                                src={URL.createObjectURL(img)} 
                                alt="preview" 
                                className="w-full h-full object-cover" 
                            />
                            </div>
                        ))}
                        {gameState.images.length > 5 && (
                            <div className="flex-shrink-0 w-20 h-20 rounded-2xl border-4 border-white bg-sky-400 flex items-center justify-center text-white font-black text-xl shadow-lg rotate-3">
                            +{gameState.images.length - 5}
                            </div>
                        )}
                        </div>
                        <p className="text-xl font-black text-sky-500">{gameState.images.length}枚の画像</p>
                    </>
                )}
              </div>
          </div>
        </div>

        <Button 
          variant="sky" 
          size="lg" 
          fullWidth 
          onClick={startGeneration}
          disabled={gameState.images.length === 0}
          className="text-2xl py-5"
        >
           <Star className="w-8 h-8 fill-current" /> スタート！
        </Button>
      </div>
    </div>
  );

  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sky-100 p-6 font-sans">
      <div className="bg-white p-16 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-2xl w-full text-center relative border-4 border-white">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-yellow-200 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-yellow-400 p-10 rounded-full">
            <Loader2 className="w-20 h-20 text-stone-800 animate-spin" strokeWidth={3} />
          </div>
        </div>
        <h2 className="text-4xl font-black text-stone-800 mb-6">作成中...</h2>
        <p className="text-stone-500 font-bold text-2xl leading-relaxed px-4 whitespace-pre-wrap">
          {gameState.loadingMessage || "準備しています..."}
        </p>
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-teal-50 p-6 font-sans">
      <div className="bg-white p-16 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-2xl w-full text-center relative border-4 border-white">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-teal-200 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-teal-400 p-10 rounded-full">
            <Sparkles className="w-20 h-20 text-white animate-pulse" strokeWidth={3} />
          </div>
        </div>
        <h2 className="text-4xl font-black text-stone-800 mb-6">採点中...</h2>
        <p className="text-stone-500 font-bold text-2xl leading-relaxed">
          先生が結果を見て<br/>アドバイスを書いてるよ！
        </p>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="min-h-screen bg-sky-100 flex flex-col items-center py-8 px-4 font-sans selection:bg-yellow-200">
        <div className="w-full max-w-5xl relative z-10">
          <div className="flex justify-between items-end mb-6">
             <Button variant="outline" size="md" onClick={backToTitle}>やめる</Button>
             <div className="bg-white px-4 py-2 rounded-full border-2 border-stone-100 text-stone-500 font-bold flex items-center gap-2">
                {gameState.mode === GameMode.STUDY ? <BookOpen className="w-5 h-5" /> : <Sparkles className="w-5 h-5 text-yellow-500" />}
                {gameState.mode === GameMode.STUDY ? '勉強モード' : 'クイズモード'}
                
                {gameState.mode === GameMode.STUDY && (
                  <>
                     <span className="w-1 h-4 bg-stone-300 rounded-full mx-1"></span>
                     {gameState.teacher === TeacherType.AMANO ? (
                        <div className="flex items-center gap-1 text-purple-500">
                           <Zap className="w-4 h-4" /> あまの先生
                        </div>
                     ) : (
                        <div className="flex items-center gap-1 text-sky-500">
                           <UserRound className="w-4 h-4" /> すなお先生
                        </div>
                     )}
                  </>
                )}
             </div>
          </div>

          <div>
            <ProgressBar current={gameState.currentQuestionIndex + 1} total={TOTAL_QUESTIONS} />
          </div>
          
          <div 
            key={`question-card-${gameState.currentQuestionIndex}`}
            className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden mb-10 border-4 border-white relative"
          >
             <div className="absolute top-0 left-0 w-full h-6 bg-stone-100"></div>
             <div className="p-10 md:p-16 text-center mt-6">
                <h2 className="text-4xl md:text-6xl font-black text-stone-800 leading-relaxed tracking-wide break-words">
                  {question.question}
                </h2>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {question.options.map((option, idx) => {
               const isSelected = selectedAnswer === idx;
               return (
                  <button
                    key={`opt-${gameState.currentQuestionIndex}-${idx}`}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedAnswer !== null}
                    className={`
                      relative overflow-hidden p-8 rounded-3xl text-xl md:text-3xl font-bold text-left transition-all duration-200 transform
                      ${isSelected 
                        ? 'bg-sky-500 text-white shadow-none translate-y-[6px] scale-[0.98] ring-4 ring-sky-300/50' 
                        : 'bg-white border-2 border-stone-200 text-stone-700 shadow-[0_6px_0_#e7e5e4] hover:bg-stone-50 hover:shadow-[0_6px_0_#d6d3d1] active:translate-y-[6px] active:shadow-none'
                      }
                    `}
                  >
                    <div className="flex items-center gap-6 z-10 relative">
                        <span className={`
                            flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl border-4 transition-colors duration-200
                            ${isSelected ? 'bg-white text-sky-500 border-white' : 'bg-stone-100 text-stone-500 border-stone-200'}
                        `}>
                        {['A', 'B', 'C', 'D'][idx]}
                        </span>
                        <span className="leading-snug break-words">{option}</span>
                    </div>
                  </button>
               );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderFeedback = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    const result = gameState.results[gameState.results.length - 1];
    const isCorrect = result.isCorrect;

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-500 ${isCorrect ? 'bg-teal-400' : 'bg-rose-400'}`}>
        <div className="w-full max-w-3xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border-4 border-white">
          
          <div className={`p-10 text-center flex flex-col items-center`}>
            {isCorrect ? (
              <div className="flex flex-col items-center">
                 <div className="bg-teal-100 p-8 rounded-full mb-6">
                    <CheckCircle className="w-24 h-24 text-teal-500" strokeWidth={4} />
                 </div>
                <h2 className="text-6xl md:text-7xl font-black text-teal-500 tracking-wider">正解！</h2>
                <p className="text-stone-400 font-bold mt-4 text-2xl">そのちょうし！</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                 <div className="bg-rose-100 p-8 rounded-full mb-6">
                    <XCircle className="w-24 h-24 text-rose-500" strokeWidth={4} />
                 </div>
                <h2 className="text-6xl md:text-7xl font-black text-rose-500 tracking-wider">残念…</h2>
                <p className="text-stone-400 font-bold mt-4 text-2xl">ドンマイ！</p>
              </div>
            )}
          </div>
          
          <div className="px-10 pb-10 pt-4 bg-stone-50">
            {!isCorrect && (
              <div className="mb-8 p-6 bg-white rounded-3xl border-2 border-rose-100 shadow-sm">
                <p className="text-lg text-rose-400 font-black mb-3 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6" /> 正解はこれ！
                </p>
                <p className="text-4xl md:text-5xl font-black text-stone-700">{question.options[question.correctAnswerIndex]}</p>
              </div>
            )}

            <div className="mb-10">
              <div className="flex items-center gap-3 mb-4 px-2">
                <span className="bg-yellow-400 text-stone-800 text-sm font-black px-3 py-1 rounded-lg">POINT</span>
                <span className="font-bold text-stone-600 text-xl">解説</span>
              </div>

              <p className="text-stone-700 leading-relaxed bg-white p-8 rounded-3xl border-2 border-stone-200 shadow-sm text-2xl md:text-3xl font-bold">
                {question.explanation}
              </p>
              
              {detailedExplanation && (
                 <div className="mt-6 bg-sky-50 p-8 rounded-3xl border-2 border-sky-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-sky-600 font-black">
                        <Sparkles className="w-5 h-5" />
                        <span>くわしい解説</span>
                    </div>
                    <p className="text-stone-700 leading-relaxed text-2xl md:text-3xl font-bold whitespace-pre-wrap">
                        {detailedExplanation}
                    </p>
                 </div>
              )}
            </div>

            <div className="flex flex-col gap-6 mt-8">
                {!detailedExplanation && (
                    <Button 
                        onClick={handleExplain} 
                        disabled={isExplaining} 
                        variant="outline" 
                        fullWidth
                        className="text-xl py-4"
                    >
                         {isExplaining ? <Loader2 className="animate-spin w-5 h-5" /> : <><BookOpen className="w-5 h-5" /> くわしく解説を見る</>}
                    </Button>
                )}
                
                <Button 
                    onClick={nextQuestion} 
                    variant={isCorrect ? 'success' : 'danger'} 
                    fullWidth
                    className="text-3xl py-8 font-black tracking-widest transition-all"
                >
                    {gameState.currentQuestionIndex + 1 >= TOTAL_QUESTIONS ? "結果を見る！" : "次の問題へ GO!"}
                </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const correctCount = gameState.results.filter(r => r.isCorrect).length;
    const scorePercentage = Math.round((correctCount / TOTAL_QUESTIONS) * 100);
    
    const chartData = [
      { name: '正解', value: correctCount },
      { name: '不正解', value: TOTAL_QUESTIONS - correctCount },
    ];

    let themeColor = 'bg-sky-100';
    let mainColor = '#0ea5e9'; 
    let titleText = 'RESULT';
    let subText = 'おつかれさま！結果発表！';
    let Icon = Award;

    if (scorePercentage === 100) {
      themeColor = 'bg-yellow-400'; 
      mainColor = '#eab308';
      titleText = 'PERFECT!!';
      subText = 'すごい！全問正解だよ！';
      Icon = Crown;
    } else if (scorePercentage >= 80) {
      themeColor = 'bg-teal-400'; 
      mainColor = '#14b8a6';
      titleText = 'AMAZING!';
      subText = 'すばらしい！その調子！';
      Icon = ThumbsUp;
    } else if (scorePercentage >= 60) {
      themeColor = 'bg-sky-400'; 
      mainColor = '#0ea5e9';
      titleText = 'GOOD JOB!';
      subText = 'よくがんばったね！';
      Icon = Smile;
    } else {
      themeColor = 'bg-rose-400'; 
      mainColor = '#f43f5e';
      titleText = 'NICE TRY!';
      subText = '次はきっともっとできるよ！';
      Icon = Frown; 
    }

    const COLORS = ['#2DD4BF', '#F43F5E'];
    const replayButtonVariant = scorePercentage === 100 ? 'primary' : 'secondary';

    return (
      <div className={`min-h-screen ${themeColor} flex flex-col items-center py-12 px-4 font-sans transition-colors duration-700`}>
        <div className="w-full max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-6xl md:text-8xl font-black text-white mb-4 drop-shadow-md tracking-wider flex justify-center items-center gap-4">
              {scorePercentage === 100 && <Sparkles className="w-16 h-16 text-white" />}
              {titleText}
              {scorePercentage === 100 && <Sparkles className="w-16 h-16 text-white" />}
            </h1>
            <p className="text-white/90 font-bold text-3xl">{subText}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
             <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-white flex flex-col items-center justify-center">
                <Icon className="w-24 h-24 mb-6" style={{ color: mainColor, fill: scorePercentage === 100 ? mainColor : 'none' }} strokeWidth={scorePercentage === 100 ? 0 : 3} />
                <div className="text-8xl font-black text-stone-800 mb-4">
                  {correctCount}<span className="text-4xl text-stone-300">/{TOTAL_QUESTIONS}</span>
                </div>
                <div className="inline-block bg-stone-100 px-6 py-2 rounded-full text-stone-500 font-bold text-xl">正解数</div>
             </div>

             <div className="bg-white p-10 rounded-[3rem] shadow-xl border-4 border-white flex flex-col items-center justify-center h-96 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '18px'}} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                    <span className="text-stone-400 text-lg font-bold">正答率</span>
                    <span className="font-black text-5xl text-stone-800">{Math.round((correctCount / TOTAL_QUESTIONS) * 100)}%</span>
                </div>
             </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[2.5rem] shadow-lg border-4 border-white mb-10">
            <div className="flex items-center gap-3 mb-4">
               <div className="bg-teal-500 text-white p-2 rounded-xl">
                 <Sparkles className="w-6 h-6" />
               </div>
               <span className="text-2xl font-black text-stone-700">先生からのアドバイス</span>
            </div>
            <p className="text-2xl md:text-3xl text-stone-700 font-bold leading-relaxed whitespace-pre-wrap">
              {gameState.advice || "読み込み中..."}
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-6 justify-center">
            <Button onClick={replayWithSameImages} size="lg" variant={replayButtonVariant} className="text-2xl py-6 shadow-xl">
              <RefreshCw className="w-6 h-6" /> 同じ画像で再挑戦
            </Button>
            <Button onClick={backToTitle} size="lg" variant="outline" className="text-2xl py-6 bg-white shadow-xl">
              タイトルに戻る
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderError = () => (
    <div className="min-h-screen bg-rose-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl max-w-2xl text-center border-4 border-white">
        <div className="bg-rose-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <XCircle className="w-12 h-12 text-rose-500" strokeWidth={3} />
        </div>
        <h2 className="text-4xl font-black text-rose-500 mb-4">エラー！</h2>
        <p className="text-stone-500 mb-10 font-bold leading-relaxed text-2xl">{gameState.errorMessage || "予期せぬエラーです。"}</p>
        <Button onClick={backToTitle} variant="primary" fullWidth size="lg">戻る</Button>
      </div>
    </div>
  );

  return (
    <>
      <Modal 
        isOpen={modalState.isOpen} 
        onClose={closeModal} 
        title={modalState.title} 
        message={modalState.message}
        type={modalState.type}
      />

      {gameState.stage === AppStage.TITLE && renderTitle()}
      {gameState.stage === AppStage.GENERATING && renderGenerating()}
      {gameState.stage === AppStage.PLAYING && renderPlaying()}
      {gameState.stage === AppStage.FEEDBACK && renderFeedback()}
      {gameState.stage === AppStage.ANALYZING && renderAnalyzing()}
      {gameState.stage === AppStage.SUMMARY && renderSummary()}
      {gameState.stage === AppStage.ERROR && renderError()}
    </>
  );
};

export default App;
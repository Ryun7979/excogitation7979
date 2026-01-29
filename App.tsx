
import React, { useState } from 'react';
import { Upload, Play, RefreshCw, CheckCircle, XCircle, Clock, Award, Image as ImageIcon, Loader2, Star, Sparkles, BookOpen, Crown, Smile, Frown, ThumbsUp, UserRound, Zap, ArrowRight, ChevronRight } from 'lucide-react';
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
    teacher: TeacherType.SUNAO,
    images: [],
    questions: [],
    currentQuestionIndex: 0,
    results: [],
  });

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [detailedExplanation, setDetailedExplanation] = useState<string | undefined>(undefined);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'info' | 'success' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showModal = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  };

  const closeModal = () => setModalState(prev => ({ ...prev, isOpen: false }));
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files as FileList);
      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `一度に${MAX_IMAGES}枚までだよ！`, 'error');
        e.target.value = '';
        return;
      }
      setGameState(prev => ({ ...prev, images: files }));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(file => file.type.startsWith('image/'));
      if (files.length === 0) {
        showModal('エラー', '画像ファイルを選んでね！', 'error');
        return;
      }
      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `${MAX_IMAGES}枚以内にしてね！`, 'error');
        return;
      }
      setGameState(prev => ({ ...prev, images: files }));
    }
  };

  const startGeneration = async () => {
    if (gameState.images.length === 0) {
        showModal('画像がないよ！', 'まずは画像をえらんでね！', 'error');
        return;
    }
    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, loadingMessage: "クイズを考えているよ..." }));
    try {
      const questions = await generateQuizFromImages(
        gameState.images, 
        gameState.mode,
        gameState.teacher,
        (msg) => setGameState(prev => ({ ...prev, loadingMessage: msg }))
      );
      setGameState(prev => ({
        ...prev,
        questions,
        stage: AppStage.PLAYING,
        currentQuestionIndex: 0,
        results: [],
      }));
      setStartTime(Date.now());
    } catch (error: any) {
      setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
      showModal('エラー', error.message || "問題が作れなかったよ...", 'error');
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (selectedAnswer !== null) return; 
    setDetailedExplanation(undefined);
    setIsExplaining(false);
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

  const handleExplain = async () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    if (question.detailedExplanation) {
        setDetailedExplanation(question.detailedExplanation);
        return;
    }
    setIsExplaining(true);
    try {
      const explanation = await generateDetailedExplanation(question);
      setDetailedExplanation(explanation);
      question.detailedExplanation = explanation;
    } catch (error) {
      showModal('エラー', '解説が作れなかったよ...', 'error');
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

  const backToTitle = () => {
    setGameState(prev => ({
      stage: AppStage.TITLE,
      mode: prev.mode,
      teacher: prev.teacher,
      images: [],
      questions: [],
      currentQuestionIndex: 0,
      results: [],
    }));
    setSelectedAnswer(null);
  };

  const renderTitle = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-yellow-400 overflow-hidden font-sans relative">
      <ApiStatus />
      
      {/* Decorative Circles */}
      <div className="absolute top-[-10%] left-[-5%] w-64 h-64 bg-yellow-300 rounded-full blur-3xl opacity-50"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-96 h-96 bg-orange-300 rounded-full blur-3xl opacity-30"></div>

      <div className="relative w-full max-w-2xl bg-white rounded-[3.5rem] p-10 md:p-14 shadow-[0_20px_0_rgba(0,0,0,0.05)] text-center border-b-[12px] border-stone-100 z-10 scale-in">
        <div className="mb-10">
            <span className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-sky-50 text-sky-500 font-black mb-6 tracking-widest text-lg uppercase border-2 border-sky-100">
              <Sparkles className="w-5 h-5" /> AI Quiz Master
            </span>
            <h1 className="text-7xl md:text-9xl font-black text-stone-800 leading-none tracking-tighter mb-2">
            Four<br/>Choices
            </h1>
            <div className="h-2 w-24 bg-yellow-400 mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-8">
           <button 
             onClick={() => setGameState(prev => ({ ...prev, mode: GameMode.QUIZ }))}
             className={`p-6 rounded-[2rem] border-4 transition-all duration-300 flex flex-col items-center gap-3 ${
               gameState.mode === GameMode.QUIZ 
               ? 'bg-yellow-400 border-yellow-500 shadow-[0_8px_0_#ca8a04] -translate-y-2' 
               : 'bg-stone-50 border-transparent text-stone-400 hover:bg-stone-100 shadow-inner'
             }`}
           >
              <div className={`p-3 rounded-2xl ${gameState.mode === GameMode.QUIZ ? 'bg-white text-yellow-500 shadow-md' : 'bg-stone-200 text-stone-400'}`}>
                <Star className="w-8 h-8 fill-current" />
              </div>
              <div className={`font-black text-xl ${gameState.mode === GameMode.QUIZ ? 'text-stone-900' : 'text-stone-400'}`}>クイズ</div>
           </button>

           <button 
             onClick={() => setGameState(prev => ({ ...prev, mode: GameMode.STUDY }))}
             className={`p-6 rounded-[2rem] border-4 transition-all duration-300 flex flex-col items-center gap-3 ${
               gameState.mode === GameMode.STUDY 
               ? 'bg-sky-400 border-sky-500 shadow-[0_8px_0_#0284c7] -translate-y-2' 
               : 'bg-stone-50 border-transparent text-stone-400 hover:bg-stone-100 shadow-inner'
             }`}
           >
              <div className={`p-3 rounded-2xl ${gameState.mode === GameMode.STUDY ? 'bg-white text-sky-500 shadow-md' : 'bg-stone-200 text-stone-400'}`}>
                <BookOpen className="w-8 h-8" />
              </div>
              <div className={`font-black text-xl ${gameState.mode === GameMode.STUDY ? 'text-stone-900' : 'text-stone-400'}`}>べんきょう</div>
           </button>
        </div>

        {gameState.mode === GameMode.STUDY && (
           <div className="bg-stone-50 p-6 rounded-[2.5rem] border-2 border-stone-100 mb-10 text-left">
              <div className="text-stone-400 font-black text-sm mb-4 tracking-widest px-1">先生をえらんでね</div>
              <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setGameState(prev => ({ ...prev, teacher: TeacherType.SUNAO }))}
                    className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                      gameState.teacher === TeacherType.SUNAO
                      ? 'bg-white border-sky-400 shadow-md ring-4 ring-sky-50' 
                      : 'bg-white border-transparent text-stone-300'
                    }`}
                  >
                     <div className={`p-2 rounded-xl ${gameState.teacher === TeacherType.SUNAO ? 'bg-sky-500 text-white' : 'bg-stone-100'}`}>
                        <UserRound className="w-6 h-6" />
                     </div>
                     <span className={`font-black ${gameState.teacher === TeacherType.SUNAO ? 'text-stone-800' : 'text-stone-300'}`}>すなお先生</span>
                  </button>

                  <button 
                    onClick={() => setGameState(prev => ({ ...prev, teacher: TeacherType.AMANO }))}
                    className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                      gameState.teacher === TeacherType.AMANO
                      ? 'bg-white border-purple-400 shadow-md ring-4 ring-purple-50' 
                      : 'bg-white border-transparent text-stone-300'
                    }`}
                  >
                     <div className={`p-2 rounded-xl ${gameState.teacher === TeacherType.AMANO ? 'bg-purple-500 text-white' : 'bg-stone-100'}`}>
                        <Zap className="w-6 h-6" />
                     </div>
                     <span className={`font-black ${gameState.teacher === TeacherType.AMANO ? 'text-stone-800' : 'text-stone-300'}`}>あまの先生</span>
                  </button>
              </div>
           </div>
        )}
        
        <div className="relative group mb-10">
          <div 
             onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
             onDragLeave={() => setIsDragging(false)}
             onDrop={handleDrop}
             className={`rounded-[2.5rem] border-4 border-dashed p-8 transition-all cursor-pointer ${
                isDragging 
                  ? 'border-sky-500 bg-sky-50 scale-105 shadow-xl' 
                  : 'bg-stone-50 border-stone-200 hover:border-sky-300 hover:bg-white'
             }`}
          >
             <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
              
              <div className="flex flex-col items-center justify-center min-h-[160px]">
                {gameState.images.length === 0 ? (
                    <>
                        <div className="w-20 h-20 rounded-3xl bg-sky-400 flex items-center justify-center mb-5 text-white shadow-[0_8px_0_#0284c7] transform group-hover:rotate-12 transition-transform">
                            <Upload className="w-10 h-10" strokeWidth={3} />
                        </div>
                        <p className="text-2xl font-black text-stone-600">画像をえらんでね！</p>
                    </>
                ) : (
                    <div className="flex flex-col items-center">
                        <div className="flex -space-x-5 mb-5 overflow-visible">
                        {gameState.images.slice(0, 4).map((img, i) => (
                            <div key={i} className="w-20 h-20 rounded-2xl border-4 border-white overflow-hidden shadow-xl bg-stone-200 rotate-[5deg] even:rotate-[-5deg]">
                                <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                            </div>
                        ))}
                        {gameState.images.length > 4 && (
                            <div className="w-20 h-20 rounded-2xl border-4 border-white bg-sky-500 flex items-center justify-center text-white font-black text-2xl shadow-xl -rotate-6">
                            +{gameState.images.length - 4}
                            </div>
                        )}
                        </div>
                        <p className="text-2xl font-black text-sky-500">{gameState.images.length}枚の画像をセットしたよ！</p>
                    </div>
                )}
              </div>
          </div>
        </div>

        <Button variant="sky" size="lg" fullWidth onClick={startGeneration} disabled={gameState.images.length === 0} className="text-3xl py-6 rounded-[2rem]">
           はじめる！ <ChevronRight className="w-8 h-8" />
        </Button>
      </div>
    </div>
  );

  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sky-400 p-6 font-sans">
      <div className="bg-white p-16 rounded-[4rem] shadow-2xl flex flex-col items-center max-w-2xl w-full text-center border-b-[16px] border-stone-100">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-yellow-200 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-yellow-400 p-12 rounded-[2.5rem] shadow-[0_12px_0_#ca8a04]">
            <Loader2 className="w-20 h-20 text-stone-800 animate-spin" strokeWidth={4} />
          </div>
        </div>
        <h2 className="text-5xl font-black text-stone-800 mb-6">作成中...</h2>
        <p className="text-stone-500 font-black text-2xl leading-relaxed">
          {gameState.loadingMessage || "AIが問題を考えているよ..."}
        </p>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center py-12 px-6 font-sans">
        <div className="w-full max-w-5xl">
          <div className="flex justify-between items-center mb-10">
             <Button variant="outline" size="md" onClick={backToTitle} className="rounded-2xl">タイトル</Button>
             <div className="bg-white px-6 py-3 rounded-full border-4 border-white shadow-sm text-stone-500 font-black flex items-center gap-3">
                {gameState.mode === GameMode.STUDY ? <BookOpen className="w-6 h-6 text-sky-500" /> : <Star className="w-6 h-6 text-yellow-500" />}
                <span className="text-xl">{gameState.mode === GameMode.STUDY ? 'べんきょう' : 'クイズ'}</span>
                {gameState.mode === GameMode.STUDY && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${gameState.teacher === TeacherType.AMANO ? 'bg-purple-100 text-purple-600' : 'bg-sky-100 text-sky-600'}`}>
                    {gameState.teacher === TeacherType.AMANO ? <Zap className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
                    <span className="text-sm font-black">{gameState.teacher === TeacherType.AMANO ? 'あまの先生' : 'すなお先生'}</span>
                  </div>
                )}
             </div>
          </div>

          <ProgressBar current={gameState.currentQuestionIndex + 1} total={TOTAL_QUESTIONS} />
          
          <div className="bg-white rounded-[3.5rem] shadow-[0_15px_0_rgba(0,0,0,0.02)] overflow-hidden mb-12 border-b-[12px] border-stone-100 p-12 md:p-20 text-center relative card-fade-in">
                <h2 className="text-5xl md:text-7xl font-black text-stone-800 leading-[1.3] tracking-tight">
                  {question.question}
                </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={selectedAnswer !== null}
                className={`
                  relative p-8 md:p-10 rounded-[2.5rem] text-2xl md:text-4xl font-black text-left transition-all duration-200 transform
                  ${selectedAnswer === idx 
                    ? 'bg-sky-500 text-white shadow-none translate-y-2 scale-[0.98]' 
                    : 'bg-white border-b-[10px] border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 active:translate-y-2 active:border-b-0'
                  }
                `}
              >
                <div className="flex items-center gap-8">
                    <span className={`
                        flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center font-black text-3xl border-4
                        ${selectedAnswer === idx ? 'bg-white text-sky-500 border-white' : 'bg-stone-100 text-stone-400 border-stone-200'}
                    `}>
                    {['A', 'B', 'C', 'D'][idx]}
                    </span>
                    <span className="leading-tight">{option}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFeedback = () => {
    const question = gameState.questions[gameState.currentQuestionIndex];
    const isCorrect = gameState.results[gameState.results.length - 1].isCorrect;
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-500 ${isCorrect ? 'bg-teal-400' : 'bg-rose-400'}`}>
        <div className="w-full max-w-4xl bg-white rounded-[4rem] shadow-2xl overflow-hidden border-b-[20px] border-black/10 scale-in">
          <div className="p-12 text-center">
            {isCorrect ? (
              <div className="flex flex-col items-center">
                 <div className="bg-teal-100 p-10 rounded-full mb-8 animate-bounce">
                    <CheckCircle className="w-28 h-28 text-teal-500" strokeWidth={5} />
                 </div>
                <h2 className="text-7xl md:text-8xl font-black text-teal-500">正解！</h2>
                <p className="text-stone-400 font-black mt-4 text-3xl">すごいね、大あたり！</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                 <div className="bg-rose-100 p-10 rounded-full mb-8 animate-pulse">
                    <XCircle className="w-28 h-28 text-rose-500" strokeWidth={5} />
                 </div>
                <h2 className="text-7xl md:text-8xl font-black text-rose-500">ざんねん</h2>
                <p className="text-stone-400 font-black mt-4 text-3xl">次は正解できるよ！</p>
              </div>
            )}
          </div>
          
          <div className="px-12 pb-14 pt-6 bg-stone-50">
            {!isCorrect && (
              <div className="mb-10 p-10 bg-white rounded-[3rem] border-4 border-rose-100 shadow-sm text-center">
                <p className="text-2xl text-rose-400 font-black mb-4 flex justify-center items-center gap-2">
                    <CheckCircle className="w-8 h-8" /> 正解はこれ！
                </p>
                <p className="text-5xl md:text-6xl font-black text-stone-800">{question.options[question.correctAnswerIndex]}</p>
              </div>
            )}

            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6 px-4">
                <span className="bg-yellow-400 text-stone-800 text-lg font-black px-4 py-2 rounded-xl shadow-sm">POINT</span>
                <span className="font-black text-stone-400 text-2xl tracking-widest uppercase">解説</span>
              </div>
              <p className="text-stone-800 leading-relaxed bg-white p-10 rounded-[3rem] shadow-sm text-3xl md:text-4xl font-black border-b-8 border-stone-200">
                {question.explanation}
              </p>
              {detailedExplanation && (
                 <div className="mt-8 bg-sky-50 p-10 rounded-[3rem] border-4 border-sky-100 shadow-sm fade-in">
                    <div className="flex items-center gap-3 mb-4 text-sky-500 font-black text-xl uppercase tracking-widest">
                        <Sparkles className="w-6 h-6" /> くわしい解説
                    </div>
                    <p className="text-stone-700 leading-relaxed text-2xl md:text-3xl font-black whitespace-pre-wrap">
                        {detailedExplanation}
                    </p>
                 </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                {!detailedExplanation && (
                    <Button onClick={handleExplain} disabled={isExplaining} variant="outline" size="lg" className="flex-1 text-2xl py-6 rounded-3xl">
                         {isExplaining ? <Loader2 className="animate-spin w-8 h-8" /> : <><BookOpen className="w-8 h-8" /> くわしく！</>}
                    </Button>
                )}
                <Button onClick={nextQuestion} variant={isCorrect ? 'success' : 'danger'} size="lg" className="flex-[2] text-4xl py-8 rounded-[2.5rem] font-black tracking-widest">
                    {gameState.currentQuestionIndex + 1 >= TOTAL_QUESTIONS ? "結果発表！" : "次へすすむ！"}
                </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const correctCount = gameState.results.filter(r => r.isCorrect).length;
    const score = Math.round((correctCount / TOTAL_QUESTIONS) * 100);
    const chartData = [{ value: correctCount }, { value: TOTAL_QUESTIONS - correctCount }];
    const COLORS = ['#2DD4BF', '#F43F5E'];

    return (
      <div className={`min-h-screen ${score >= 80 ? 'bg-yellow-400' : 'bg-sky-400'} flex flex-col items-center py-16 px-6 font-sans`}>
        <div className="w-full max-w-5xl">
          <div className="text-center mb-16">
            <h1 className="text-7xl md:text-9xl font-black text-white mb-6 drop-shadow-[0_8px_0_rgba(0,0,0,0.1)] tracking-tight">
              {score === 100 ? 'PERFECT!' : score >= 80 ? 'AWESOME!' : 'WELL DONE!'}
            </h1>
            <p className="text-white font-black text-3xl bg-black/10 inline-block px-8 py-3 rounded-full">よくがんばったね！</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
             <div className="bg-white p-14 rounded-[4rem] shadow-2xl border-b-[16px] border-stone-100 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 text-stone-50">
                   <Crown className="w-32 h-32 rotate-12" />
                </div>
                <div className="text-[12rem] font-black text-stone-800 leading-none mb-4 z-10">
                  {correctCount}<span className="text-5xl text-stone-200">/10</span>
                </div>
                <div className="bg-stone-50 px-8 py-3 rounded-full text-stone-400 font-black text-2xl z-10">せいかい数</div>
             </div>

             <div className="bg-white p-14 rounded-[4rem] shadow-2xl border-b-[16px] border-stone-100 flex flex-col items-center justify-center h-[400px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={100} outerRadius={140} paddingAngle={8} dataKey="value" stroke="none">
                      {chartData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-stone-300 text-2xl font-black uppercase tracking-widest">Score</span>
                    <span className="font-black text-7xl text-stone-800">{score}%</span>
                </div>
             </div>
          </div>

          <div className="bg-white p-12 rounded-[4rem] shadow-2xl border-b-[16px] border-stone-100 mb-12 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 text-teal-50">
               <Sparkles className="w-48 h-48" />
            </div>
            <div className="flex items-center gap-4 mb-8 relative z-10">
               <div className="bg-teal-500 text-white p-4 rounded-3xl shadow-lg">
                 <ThumbsUp className="w-8 h-8" />
               </div>
               <span className="text-4xl font-black text-stone-800 tracking-tighter">先生からのメッセージ</span>
            </div>
            <p className="text-3xl md:text-4xl text-stone-700 font-black leading-[1.6] relative z-10">
              {gameState.advice || "読みこみ中..."}
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 justify-center">
            <Button onClick={backToTitle} size="lg" variant="primary" className="text-3xl py-8 px-12 rounded-[2.5rem] bg-stone-800 shadow-[0_12px_0_#1c1917] hover:bg-stone-700">
               タイトルにもどる
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .scale-in { animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .card-fade-in { animation: scaleIn 0.4s ease-out forwards; }
        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <Modal isOpen={modalState.isOpen} onClose={closeModal} title={modalState.title} message={modalState.message} type={modalState.type} />
      {gameState.stage === AppStage.TITLE && renderTitle()}
      {gameState.stage === AppStage.GENERATING && renderGenerating()}
      {gameState.stage === AppStage.PLAYING && renderPlaying()}
      {gameState.stage === AppStage.FEEDBACK && renderFeedback()}
      {gameState.stage === AppStage.ANALYZING && <div className="flex items-center justify-center min-h-screen bg-teal-400 font-black text-white text-5xl animate-pulse">採点中...</div>}
      {gameState.stage === AppStage.SUMMARY && renderSummary()}
      {gameState.stage === AppStage.ERROR && <div className="min-h-screen flex items-center justify-center">Error.</div>}
    </>
  );
};

export default App;

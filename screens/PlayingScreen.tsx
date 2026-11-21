import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { QuizQuestion, QuizResult } from '../types';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ProgressBar } from '../components/ProgressBar';

interface PlayingScreenProps {
  question: QuizQuestion;
  index: number;
  total: number;
  results: QuizResult[];
  selectedAnswer: number | null;
  isReview: boolean;
  isQuitConfirmOpen: boolean;
  onAnswer: (optionIndex: number) => void;
  onJump: (index: number) => void;
  onQuit: () => void;
  onConfirmQuit: () => void;
  onCancelQuit: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

// 長い選択肢は小さくするが、子どもが読める大きさ（14px）より小さくしない
const optionTextClass = (text: string) => {
  if (text.length > 60) return 'text-fl-sm';
  if (text.length > 28) return 'text-fl-base';
  return 'text-fl-lg';
};

// 問題文も長さで大きさを変える（短い問題は大きく、長い問題も1画面に収める）
const questionTextClass = (text: string) => {
  if (text.length > 120) return 'text-fl-lg';
  if (text.length > 60) return 'text-fl-xl';
  return 'text-fl-2xl';
};

export const PlayingScreen: React.FC<PlayingScreenProps> = ({
  question, index, total, results, selectedAnswer, isReview, isQuitConfirmOpen,
  onAnswer, onJump, onQuit, onConfirmQuit, onCancelQuit,
}) => {
  // キーボードでも答えられる: 1〜4 / A〜D
  useEffect(() => {
    if (isQuitConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      const i = ['1', '2', '3', '4'].indexOf(key) >= 0 ? Number(key) - 1 : ['a', 'b', 'c', 'd'].indexOf(key);
      if (i >= 0 && i < question.options.length) {
        e.preventDefault();
        onAnswer(i);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isQuitConfirmOpen, question, onAnswer]);

  const answered = selectedAnswer !== null;

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-from to-brand-to safe-area">
      <header className="mx-auto flex w-full max-w-[1600px] shrink-0 items-start gap-fl-3 px-fl-4 pb-fl-2 pt-fl-3">
        <Button variant="ghost" size="sm" onClick={onQuit} className="shrink-0">
          <X className="h-5 w-5" aria-hidden="true" />やめる
        </Button>
        <ProgressBar
          current={index + 1}
          total={total}
          results={results}
          onSelectQuestion={onJump}
          className="flex-1"
        />
        {isReview && (
          <span className="hidden shrink-0 rounded-full bg-amber-300 px-3 py-1 text-fl-xs font-black text-slate-900 sm:block">ふくしゅう</span>
        )}
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-rows-[minmax(0,1fr)_auto] gap-fl-3 px-fl-4 pb-fl-4 short:grid-cols-[1fr_1.15fr] short:grid-rows-1">
        <section
          aria-label={`第${index + 1}問`}
          className="thin-scrollbar flex min-h-[6rem] overflow-y-auto rounded-card bg-white p-fl-4 shadow-xl"
        >
          <h2 className={`m-auto max-w-4xl select-text text-center font-black text-ink ${questionTextClass(question.question)}`}>
            {question.question}
          </h2>
        </section>

        <div className="grid grid-cols-1 content-center gap-fl-2 sm:grid-cols-2 short:grid-cols-1 short:overflow-y-auto">
          {question.options.map((option, idx) => {
            const isChosen = selectedAnswer === idx;
            const isAnswer = idx === question.correctAnswerIndex;
            const state = !answered
              ? 'bg-white text-ink shadow-[0_5px_0_#cbd5e1] hover:bg-amber-50 active:translate-y-[3px] active:shadow-none'
              : isAnswer
                ? 'bg-ok text-white shadow-none'
                : isChosen
                  ? 'bg-ng text-white shadow-none'
                  : 'bg-white/60 text-ink-muted shadow-none';
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onAnswer(idx)}
                disabled={answered}
                aria-keyshortcuts={`${idx + 1} ${LETTERS[idx]}`}
                className={`flex min-h-[clamp(3.5rem,11vmin,7rem)] items-center gap-fl-2 rounded-btn px-fl-3 py-fl-2 text-left font-black transition-colors ${state}`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[clamp(2.25rem,6vmin,3.5rem)] w-[clamp(2.25rem,6vmin,3.5rem)] shrink-0 place-items-center rounded-full text-fl-base font-black ${answered ? 'bg-white/25' : 'bg-brand-accent text-white'}`}
                >
                  {LETTERS[idx]}
                </span>
                <span className={`min-w-0 flex-1 break-words leading-snug ${optionTextClass(option)}`}>{option}</span>
              </button>
            );
          })}
        </div>
      </main>

      <Dialog
        open={isQuitConfirmOpen}
        onClose={onCancelQuit}
        title="やめますか？"
        actions={(
          <>
            <Button variant="secondary" fullWidth onClick={onCancelQuit} data-autofocus>つづける</Button>
            <Button variant="danger" fullWidth onClick={onConfirmQuit}>やめる</Button>
          </>
        )}
      >
        <p className="font-bold text-ink-muted">ここでやめると、さいしょの画面にもどるよ。</p>
      </Dialog>
    </div>
  );
};

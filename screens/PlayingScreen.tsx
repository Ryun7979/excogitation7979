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
// 選択肢ごとにちがう色のマーク（クイズ番組のように、ぱっと見分けられる）
const BADGE_COLORS = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-600', 'bg-orange-600'];

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
    <div className="flex h-full flex-col pop-bg safe-area">
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
            // 答えたあと: 正解はあざやかな緑＋◯、えらんだ不正解は赤＋✕（ゆれる）。
            // それ以外は白のまま薄くして、正解・不正解の色が目立つようにする
            const state = !answered
              ? 'bg-white text-ink shadow-[0_5px_0_rgba(15,23,42,0.25)] hover:-translate-y-0.5 hover:bg-amber-50 active:translate-y-[3px] active:shadow-none'
              : isAnswer
                ? 'z-10 bg-ok text-white ring-4 ring-ok-ring shadow-[0_6px_0_#14532d] animate-pop'
                : isChosen
                  ? 'z-10 bg-ng text-white ring-4 ring-ng-ring shadow-[0_6px_0_#881337] animate-shake'
                  : 'bg-white text-ink-muted opacity-45 shadow-none';
            const mark = answered && isAnswer ? '◯' : answered && isChosen ? '✕' : null;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onAnswer(idx)}
                disabled={answered}
                aria-keyshortcuts={`${idx + 1} ${LETTERS[idx]}`}
                className={`relative flex min-h-[clamp(3.5rem,11vmin,7rem)] items-center gap-fl-2 rounded-btn px-fl-3 py-fl-2 text-left font-black transition-transform duration-150 ${state}`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[clamp(2.25rem,6vmin,3.5rem)] w-[clamp(2.25rem,6vmin,3.5rem)] shrink-0 place-items-center rounded-full text-fl-base font-black shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)] ${mark ? `bg-white text-fl-lg ${isAnswer ? 'text-ok' : 'text-ng'}` : `text-white ${BADGE_COLORS[idx]}`}`}
                >
                  {mark ?? LETTERS[idx]}
                </span>
                <span className={`min-w-0 flex-1 break-words leading-snug ${optionTextClass(option)}`}>{option}</span>
                {mark && <span className="sr-only">{isAnswer ? '（せいかい）' : '（えらんだこたえ・まちがい）'}</span>}
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

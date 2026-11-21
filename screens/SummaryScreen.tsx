import React from 'react';
import { RotateCcw, Sparkles, Home, Check, X } from 'lucide-react';
import { QuizQuestion, QuizResult } from '../types';
import { Button } from '../components/Button';

interface SummaryScreenProps {
  questions: QuizQuestion[];
  results: QuizResult[];
  advice?: string;
  isReview: boolean;
  canPlayAgain: boolean;
  onRetryWrong: () => void;
  onPlayAgain: () => void;
  onFinish: () => void;
}

/** 点数に合わせた見出し（どの点数でも「パーフェクト」と出ていた不具合を直した） */
export const scoreHeadline = (correct: number, total: number): string => {
  if (total > 0 && correct === total) return 'パーフェクト！';
  const rate = total > 0 ? correct / total : 0;
  if (rate >= 0.8) return 'すごい！';
  if (rate >= 0.5) return 'よくがんばったね';
  return 'つぎはもっといけるよ';
};

export const SummaryScreen: React.FC<SummaryScreenProps> = ({
  questions, results, advice, isReview, canPlayAgain, onRetryWrong, onPlayAgain, onFinish,
}) => {
  const total = results.length;
  const correct = results.filter(r => r.isCorrect).length;
  const wrong = total - correct;

  return (
    <div className="h-full pop-bg safe-area">
      <div className="thin-scrollbar h-full overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-fl-4 p-fl-4 md:grid-cols-[minmax(320px,2fr)_3fr] short:grid-cols-[minmax(300px,2fr)_3fr]">
          <section className="flex flex-col gap-fl-3" aria-labelledby="score-title">
            <h1 id="score-title" className="text-fl-2xl font-black text-white">
              {isReview ? 'ふくしゅうのけっか' : 'けっか'}
            </h1>
            <div className="rounded-card bg-white p-fl-4 text-center shadow-xl">
              <p className="text-fl-xl font-black text-brand-to">{scoreHeadline(correct, total)}</p>
              <p className="font-black text-ink" aria-label={`${total}問中${correct}問せいかい`}>
                <span className="text-fl-hero tabular-nums text-brand-via">{correct}</span>
                <span className="text-fl-2xl text-ink-muted"> / {total}</span>
              </p>
              {advice && <p className="mt-fl-2 text-fl-base font-bold text-ink-muted">{advice}</p>}
            </div>

            <div className="flex flex-col gap-fl-2">
              {wrong > 0 && (
                <Button size="lg" onClick={onRetryWrong} autoFocus>
                  <RotateCcw className="h-6 w-6 shrink-0" aria-hidden="true" />まちがえた{wrong}問をとき直す
                </Button>
              )}
              {canPlayAgain && (
                <Button variant={wrong > 0 ? 'secondary' : 'primary'} size={wrong > 0 ? 'md' : 'lg'} onClick={onPlayAgain} autoFocus={wrong === 0}>
                  <Sparkles className="h-5 w-5" aria-hidden="true" />あたらしい問題で遊ぶ
                </Button>
              )}
              <Button variant="ghost" onClick={onFinish}>
                <Home className="h-5 w-5" aria-hidden="true" />おわる
              </Button>
            </div>
          </section>

          <section aria-labelledby="list-title" className="rounded-card bg-white p-fl-3 shadow-xl">
            <h2 id="list-title" className="mb-fl-2 text-fl-lg font-black text-ink">ふりかえり</h2>
            <ol className="flex flex-col divide-y divide-slate-100">
              {results.map((r, i) => {
                const q = questions[r.questionIndex];
                if (!q) return null;
                return (
                  <li key={i} className="flex gap-fl-2 py-fl-2">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${r.isCorrect ? 'bg-ok' : 'bg-ng'}`}
                      aria-label={r.isCorrect ? 'せいかい' : 'まちがい'}
                    >
                      {r.isCorrect ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 select-text">
                      <p className="text-fl-sm font-bold text-ink">{q.question}</p>
                      <p className="text-fl-xs font-bold text-ink-muted">
                        こたえ: <span className="text-ok-ink">{q.options[q.correctAnswerIndex]}</span>
                        {!r.isCorrect && r.chosenIndex !== undefined && q.options[r.chosenIndex] !== undefined && (
                          <>（えらんだ: <span className="text-ng-ink">{q.options[r.chosenIndex]}</span>）</>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
};

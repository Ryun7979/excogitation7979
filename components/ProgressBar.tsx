import React from 'react';
import { QuizResult } from '../types';

interface ProgressBarProps {
  current: number;
  total: number;
  results: QuizResult[];
  className?: string;
  onSelectQuestion?: (index: number) => void;
}

/** 何問目か と、これまでの正解・不正解のランプ。答えたランプを押すとその問題からやり直せる */
export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, results, className = '', onSelectQuestion }) => {
  const lamps = Array.from({ length: total }, (_, i) => results[i]);

  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-fl-1 text-fl-lg font-black text-white" aria-live="polite">
        だい {current} もん <span className="text-fl-base font-bold text-white/85">/ {total} もん</span>
      </p>
      <ol className="flex flex-wrap gap-1" aria-label="これまでの結果">
        {lamps.map((result, i) => {
          const shape = 'block h-[clamp(0.75rem,2.4vmin,1.25rem)] w-[clamp(0.75rem,2.4vmin,1.25rem)] rounded-md border-2';
          if (!result) {
            const isCurrent = i === current - 1;
            return (
              <li key={i} className="grid h-8 w-6 place-items-center sm:w-8">
                <span className={`${shape} ${isCurrent ? 'border-amber-300 bg-white' : 'border-white/50 bg-white/20'}`} aria-label={`第${i + 1}問${isCurrent ? '（いまの問題）' : ''}`} />
              </li>
            );
          }
          const label = `第${i + 1}問 ${result.isCorrect ? 'せいかい' : 'まちがい'}。押すとこの問題からやり直す`;
          return (
            <li key={i}>
              {/* ランプは小さいので、押せる範囲は 32px 角とる */}
              <button
                type="button"
                disabled={!onSelectQuestion}
                onClick={() => onSelectQuestion?.(i)}
                aria-label={label}
                title={label}
                className="grid h-8 w-6 place-items-center rounded-md hover:bg-white/20 sm:w-8"
              >
                <span className={`${shape} ${result.isCorrect ? 'border-teal-100 bg-teal-400' : 'border-rose-100 bg-rose-400'}`} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

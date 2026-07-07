
import React from 'react';
import { QuizResult } from '../types';

interface ProgressBarProps {
  current: number;
  total: number;
  results: QuizResult[];
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, results, className = '' }) => {
  const answeredCount = results.length;
  const percentage = Math.min(100, (answeredCount / total) * 100);
  const lamps = Array.from({ length: total }, (_, i) => results[i]);

  return (
    <div className={`w-full shrink-0 ${className}`}>
      <div className="flex justify-between items-baseline text-sky-900 font-black mb-2 lg:mb-4 px-2 lg:px-4 drop-shadow-md">
         <span className="text-xl sm:text-2xl lg:text-4xl tracking-tighter">だい {current} もん / 全 {total} 問</span>
         <span className="text-lg sm:text-xl lg:text-3xl tabular-nums">{Math.round(percentage)}%</span>
      </div>
      <div className="flex justify-center gap-1 sm:gap-1.5 lg:gap-2 px-2 lg:px-4">
        {lamps.map((result, i) => {
          const baseShape = 'w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-6 lg:h-6 aspect-square rounded sm:rounded-md lg:rounded-lg border sm:border-2 transition-colors duration-300 shadow-inner';
          if (!result) {
            return <div key={i} className={`${baseShape} bg-white/40 border-sky-300`} />;
          }
          return (
            <div
              key={i}
              className={`${baseShape} ${result.isCorrect ? 'bg-teal-400 border-teal-200' : 'bg-rose-400 border-rose-200'}`}
            />
          );
        })}
      </div>
    </div>
  );
};

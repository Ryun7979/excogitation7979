
import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, className = '' }) => {
  const percentage = Math.min(100, (current / total) * 100);

  return (
    <div className={`w-full shrink-0 ${className}`}>
      <div className="flex justify-between items-baseline text-white font-black mb-2 lg:mb-4 px-2 lg:px-6 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
         <span className="text-2xl sm:text-3xl lg:text-5xl italic tracking-tighter">STAGE {current}-{total}</span>
         <span className="text-xl sm:text-2xl lg:text-4xl tabular-nums">{Math.round(percentage)}%</span>
      </div>
      <div className="h-8 lg:h-14 bg-stone-900/30 rounded-full overflow-hidden border-4 lg:border-[6px] border-white relative backdrop-blur-sm shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500 transition-all duration-700 ease-out shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] border-r-2 lg:border-r-4 border-yellow-600"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

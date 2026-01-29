
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
      <div className="flex justify-between items-baseline text-white font-black mb-2 lg:mb-4 px-2 lg:px-4 drop-shadow-md">
         <span className="text-xl sm:text-2xl lg:text-4xl tracking-tighter">だい {current} もん / 全 {total} 問</span>
         <span className="text-lg sm:text-xl lg:text-3xl tabular-nums">{Math.round(percentage)}%</span>
      </div>
      <div className="h-6 lg:h-10 bg-stone-900/30 rounded-full overflow-hidden border-2 lg:border-4 border-white relative backdrop-blur-sm shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500 transition-all duration-700 ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] border-r-2 border-yellow-600"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

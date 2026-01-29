
import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = Math.min(100, (current / total) * 100);

  return (
    <div className="w-full max-w-2xl mx-auto mb-12">
      <div className="flex justify-between items-end text-stone-400 font-black mb-4 px-4">
        <div className="flex items-baseline gap-2">
           <span className="text-4xl text-stone-800 tracking-tighter">Q.{current}</span>
           <span className="text-xl">/ {total}</span>
        </div>
        <span className="text-lg bg-white px-4 py-1 rounded-full shadow-sm border-2 border-stone-50">{Math.round(percentage)}%</span>
      </div>
      <div className="h-10 bg-white rounded-full overflow-hidden border-8 border-white shadow-xl">
        <div 
          className="h-full bg-yellow-400 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] rounded-full striped-bar shadow-inner"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <style>{`
        .striped-bar {
          background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.2) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0.2) 75%,
            transparent 75%,
            transparent
          );
          background-size: 30px 30px;
          animation: slide 2s linear infinite;
        }
        @keyframes slide { from { background-position: 0 0; } to { background-position: 60px 0; } }
      `}</style>
    </div>
  );
};

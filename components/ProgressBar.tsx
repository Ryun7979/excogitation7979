import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = Math.min(100, (current / total) * 100);

  return (
    <div className="w-full max-w-md mx-auto mb-10 relative z-10">
      <div className="flex justify-between text-stone-600 font-black mb-3 px-2 text-xl drop-shadow-sm">
        <span className="bg-white px-4 py-2 rounded-full shadow-sm border-2 border-stone-100">Q.{current}</span>
        <span className="bg-white px-4 py-2 rounded-full shadow-sm border-2 border-stone-100">{total}問中</span>
      </div>
      <div className="h-8 bg-stone-200 rounded-full overflow-hidden border-4 border-white shadow-inner">
        <div 
          className="h-full bg-yellow-400 transition-all duration-500 ease-out rounded-full striped-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Decorative style for stripes */}
      <style>{`
        .striped-bar {
          background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.3) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.3) 50%,
            rgba(255, 255, 255, 0.3) 75%,
            transparent 75%,
            transparent
          );
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
};
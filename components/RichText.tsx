import React from 'react';

/**
 * AIの文章をそのまま表示する。AIは **太字** の記号を混ぜることがあるので、
 * 記号を見せずに太字にする（それ以外の書式は扱わない）。
 */
export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-black text-brand-to">{part}</strong>
          : <React.Fragment key={i}>{part.replace(/\*\*/g, '')}</React.Fragment>,
      )}
    </p>
  );
};

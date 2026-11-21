import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiStatus } from '../services/geminiService';

/** AI が考えている間だけ、右上に小さく知らせる（いつも出していると画面の表示と重なるため） */
export const ApiStatus: React.FC = () => {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => setBusy(getApiStatus().status === 'busy');
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  if (!busy) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex items-center gap-2 rounded-full bg-slate-900/75 px-3 py-1.5 text-fl-xs font-bold text-white shadow-lg"
    >
      <Loader2 className="h-4 w-4 animate-spin text-amber-300" aria-hidden="true" />
      AIが考え中
    </div>
  );
};


import React, { useEffect, useState } from 'react';
import { Battery, Loader2, AlertCircle } from 'lucide-react';
import { getApiStatus } from '../services/geminiService';

export const ApiStatus: React.FC = () => {
  const [status, setStatus] = useState<{ status: 'ok' | 'busy' | 'warning' | 'error', label?: string, remaining?: number }>({ status: 'ok' });

  useEffect(() => {
    const checkStatus = () => {
      setStatus(getApiStatus());
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 500); 
    
    return () => clearInterval(interval);
  }, []);

  const isHealthy = status.status === 'ok';
  const isBusy = status.status === 'busy';

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col items-end pointer-events-none">
      {(isHealthy || isBusy) ? (
        <div className="bg-stone-900/40 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/20 shadow-lg pointer-events-auto group transition-all hover:bg-stone-900/60">
          {isBusy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
              <span className="text-[10px] font-black text-white uppercase tracking-tighter">AI Busy</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 bg-teal-400 rounded-full shadow-[0_0_8px_#2dd4bf] animate-pulse" />
              <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">AI Online</span>
            </>
          )}
        </div>
      ) : (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border-4 font-black shadow-xl animate-bounce pointer-events-auto ${
          status.status === 'error' ? 'bg-rose-500 text-white border-white' : 'bg-yellow-400 text-stone-800 border-white'
        }`}>
          {status.status === 'error' ? <AlertCircle className="w-5 h-5" /> : <Battery className="w-5 h-5" />}
          <span className="text-sm">
            {status.label} 
            {status.status === 'error' && status.remaining && (
              <span className="ml-1">({status.remaining}s)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

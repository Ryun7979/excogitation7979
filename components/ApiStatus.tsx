import React, { useEffect, useState } from 'react';
import { Activity, Battery, BatteryCharging, BatteryWarning, CheckCircle2 } from 'lucide-react';
import { getApiStatus } from '../services/geminiService';

export const ApiStatus: React.FC = () => {
  const [status, setStatus] = useState<{ status: 'ok' | 'warning' | 'error', label?: string, remaining?: number }>({ status: 'ok' });

  useEffect(() => {
    const checkStatus = () => {
      setStatus(getApiStatus());
    };
    
    // Check immediately and then every second
    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Removed the early return so it is always visible

  const getColor = () => {
    if (status.status === 'error') return 'bg-rose-100 text-rose-600 border-rose-200';
    if (status.status === 'warning') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    // Healthy state: subtle white/teal look
    return 'bg-white/90 text-teal-600 border-teal-100 shadow-sm backdrop-blur-sm';
  };

  const getIcon = () => {
    if (status.status === 'error') return <BatteryWarning className="w-5 h-5 animate-pulse" />;
    if (status.status === 'warning') return <Battery className="w-5 h-5" />;
    return <CheckCircle2 className="w-5 h-5" />;
  };

  return (
    // Changed position to top-right (right-4) which is more standard for status indicators
    <div className={`absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full border-2 font-bold transition-all duration-300 ${getColor()}`}>
      {getIcon()}
      <span className="text-sm">
        AIの調子: {status.label || '元気'} 
        {status.status === 'error' && status.remaining && (
            <span className="ml-1 font-black">
                (あと{status.remaining}秒)
            </span>
        )}
      </span>
    </div>
  );
};
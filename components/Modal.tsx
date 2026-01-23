import React, { useEffect, useState } from 'react';
import { XCircle, AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'info' | 'success';
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info' 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'error': return <XCircle className="w-12 h-12 text-rose-500" />;
      case 'success': return <CheckCircle className="w-12 h-12 text-teal-500" />;
      default: return <Info className="w-12 h-12 text-sky-500" />;
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'error': return 'bg-rose-50 border-rose-100';
      case 'success': return 'bg-teal-50 border-teal-100';
      default: return 'bg-sky-50 border-sky-100';
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
    >
      <div 
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      <div 
        className={`
          relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border-4 border-white transform transition-all duration-300
          ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-stone-100 text-stone-400 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className={`p-4 rounded-full mb-6 ${getColorClass()}`}>
            {getIcon()}
          </div>
          
          <h3 className="text-2xl font-black text-stone-800 mb-4">
            {title}
          </h3>
          
          <p className="text-stone-600 font-bold text-lg leading-relaxed mb-8 whitespace-pre-wrap">
            {message}
          </p>

          <Button 
            onClick={onClose} 
            variant={type === 'error' ? 'danger' : 'primary'}
            fullWidth
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  );
};
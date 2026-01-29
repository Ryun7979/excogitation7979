
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'game-yellow' | 'game-white' | 'game-orange' | 'danger' | 'pill-black';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "font-black transition-all duration-75 flex items-center justify-center gap-4 select-none transform active:translate-y-1 active:shadow-none whitespace-nowrap border-4 border-black/10";
  
  const variants = {
    primary: "bg-sky-500 text-white shadow-[0_10px_0_#0369a1] hover:bg-sky-400",
    'game-yellow': "bg-[#fcd34d] text-stone-800 shadow-[0_10px_0_#ca8a04] hover:bg-[#fde047]",
    'game-white': "bg-white text-stone-600 shadow-[0_10px_0_#d6d3d1] hover:bg-stone-50",
    'game-orange': "bg-[#f97316] text-white shadow-[0_12px_0_#9a3412] hover:bg-[#fb923c]",
    'danger': "bg-rose-500 text-white shadow-[0_10px_0_#9f1239] hover:bg-rose-400",
    'pill-black': "bg-stone-800 text-white shadow-[0_8px_0_#000] rounded-full px-12",
  };

  const sizes = {
    sm: "px-6 py-3 text-xl rounded-2xl", 
    md: "px-10 py-5 text-3xl rounded-3xl",
    lg: "px-14 py-8 text-5xl rounded-[3rem]",
    xl: "px-20 py-10 text-6xl rounded-[4rem]",
  };

  const disabledStyle = props.disabled ? "opacity-50 grayscale cursor-not-allowed shadow-none translate-y-2" : "";

  return (
    <button className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${disabledStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

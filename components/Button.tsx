
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
  const baseStyles = "font-black transition-all duration-75 flex items-center justify-center gap-3 select-none transform active:translate-y-1 active:shadow-none whitespace-nowrap border-2 lg:border-4 border-black/10";
  
  const variants = {
    primary: "bg-sky-500 text-white shadow-[0_8px_0_#0369a1] hover:bg-sky-400",
    'game-yellow': "bg-[#fcd34d] text-stone-800 shadow-[0_8px_0_#ca8a04] hover:bg-[#fde047]",
    'game-white': "bg-white text-stone-600 shadow-[0_8px_0_#d6d3d1] hover:bg-stone-50",
    'game-orange': "bg-[#f97316] text-white shadow-[0_10px_0_#9a3412] hover:bg-[#fb923c]",
    'danger': "bg-rose-500 text-white shadow-[0_8px_0_#9f1239] hover:bg-rose-400",
    'pill-black': "bg-stone-800 text-white shadow-[0_4px_0_#000] rounded-full px-8",
  };

  const sizes = {
    sm: "px-6 py-3 text-lg lg:text-xl rounded-2xl", 
    md: "px-8 py-4 text-xl lg:text-3xl rounded-[1.5rem]",
    lg: "px-10 py-5 text-2xl lg:text-4xl rounded-[2.5rem]",
    xl: "px-14 py-8 text-3xl lg:text-6xl rounded-[3.5rem]",
  };

  const disabledStyle = props.disabled ? "opacity-50 grayscale cursor-not-allowed shadow-none translate-y-1" : "";

  return (
    <button className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${disabledStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

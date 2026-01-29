
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'sky';
  size?: 'sm' | 'md' | 'lg';
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
  const { disabled } = props;

  const baseStyles = "font-black rounded-[2rem] transition-all duration-150 flex items-center justify-center gap-3 border-2 border-transparent active:translate-y-2 active:shadow-none focus:outline-none";
  
  const variants = {
    primary: "bg-indigo-500 text-white shadow-[0_10px_0_#4338ca] hover:bg-indigo-400",
    secondary: "bg-yellow-400 text-stone-900 shadow-[0_10px_0_#ca8a04] hover:bg-yellow-300",
    sky: "bg-sky-400 text-white shadow-[0_10px_0_#0284c7] hover:bg-sky-300",
    success: "bg-teal-400 text-white shadow-[0_10px_0_#0d9488] hover:bg-teal-300",
    danger: "bg-rose-400 text-white shadow-[0_10px_0_#e11d48] hover:bg-rose-300",
    outline: "bg-white text-stone-600 border-stone-200 shadow-[0_10px_0_#e7e5e4] hover:bg-stone-50",
  };

  const sizes = {
    sm: "px-6 py-3 text-lg", 
    md: "px-8 py-4 text-xl",
    lg: "px-10 py-6 text-2xl tracking-widest uppercase",
  };

  const colorStyle = disabled ? "bg-stone-200 text-stone-400 shadow-none translate-y-2 cursor-not-allowed" : variants[variant];
  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button className={`${baseStyles} ${colorStyle} ${sizes[size]} ${widthStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

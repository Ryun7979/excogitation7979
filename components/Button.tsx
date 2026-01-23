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

  // Base styles for the "3D" button look
  const baseStyles = "font-black rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 border-2 border-transparent focus:outline-none focus:ring-4 focus:ring-offset-2";
  
  // Interactive styles (applied only when not disabled)
  // When disabled, we remove the active translate/scale effects and change cursor
  const interactiveStyles = disabled
    ? "cursor-not-allowed"
    : "active:translate-y-[6px] active:shadow-none hover:scale-[1.02] active:scale-100";
  
  const variants = {
    // Indigo/Purple theme
    primary: "bg-indigo-500 text-white shadow-[0_6px_0_rgb(67,56,202)] hover:bg-indigo-400 focus:ring-indigo-300",
    // Yellow theme (matches the reference background feel)
    secondary: "bg-yellow-400 text-stone-900 shadow-[0_6px_0_rgb(202,138,4)] hover:bg-yellow-300 focus:ring-yellow-300",
    // Sky Blue theme
    sky: "bg-sky-400 text-white shadow-[0_6px_0_rgb(14,165,233)] hover:bg-sky-300 focus:ring-sky-300",
    // Emerald/Green theme
    success: "bg-teal-400 text-white shadow-[0_6px_0_rgb(13,148,136)] hover:bg-teal-300 focus:ring-teal-300",
    // Rose/Red theme
    danger: "bg-rose-400 text-white shadow-[0_6px_0_rgb(225,29,72)] hover:bg-rose-300 focus:ring-rose-300",
    // Outline theme
    outline: "bg-white text-stone-600 border-2 border-stone-200 shadow-[0_6px_0_rgb(214,211,209)] hover:bg-stone-50 hover:border-stone-300 focus:ring-stone-200",
  };

  // Override variant styles if disabled
  const colorStyle = disabled 
    ? "bg-stone-300 text-stone-500 shadow-none border-stone-300" 
    : variants[variant];

  const sizes = {
    sm: "px-6 py-3 text-base", 
    md: "px-8 py-4 text-xl",
    lg: "px-10 py-5 text-2xl tracking-wide",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseStyles} ${interactiveStyles} ${colorStyle} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
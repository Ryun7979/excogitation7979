import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary: いちばん押してほしいボタン（1画面に1つ）
   * secondary: 白いボタン
   * danger: やめる・消すなど
   * ghost: 色の濃い背景の上に置く、目立たないボタン
   */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const VARIANTS = {
  primary: 'bg-amber-400 text-slate-900 shadow-[0_5px_0_#b45309] hover:bg-amber-300',
  secondary: 'bg-white text-ink ring-2 ring-inset ring-slate-300 shadow-[0_5px_0_#cbd5e1] hover:bg-slate-50',
  danger: 'bg-ng text-white shadow-[0_5px_0_#881337] hover:bg-rose-600',
  ghost: 'bg-white/15 text-white ring-2 ring-white/40 hover:bg-white/25',
};

const SIZES = {
  sm: 'min-h-[44px] px-fl-3 py-fl-1 text-fl-base',
  md: 'min-h-[52px] px-fl-4 py-fl-2 text-fl-lg',
  lg: 'min-h-[60px] px-fl-4 py-fl-2 text-fl-xl',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}) => {
  const pressable = props.disabled
    ? 'opacity-50 cursor-not-allowed shadow-none'
    : 'active:translate-y-[3px] active:shadow-none';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-black transition-[transform,background-color] duration-75 ${VARIANTS[variant]} ${SIZES[size]} ${pressable} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

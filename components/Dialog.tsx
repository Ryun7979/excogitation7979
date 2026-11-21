import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** タイトルの左に出すアイコン */
  icon?: React.ReactNode;
  /** 閉じられないとき（読み込み中など）は false */
  closable?: boolean;
  /** 下に並べるボタン */
  actions?: React.ReactNode;
  size?: 'sm' | 'lg';
  children?: React.ReactNode;
}

/**
 * 画面の上に重ねて出すダイアログ。
 * Esc・背景のタップで閉じる。開いている間は裏の画面にフォーカスが移らないようにする。
 */
export const Dialog: React.FC<DialogProps> = ({
  open, onClose, title, icon, closable = true, actions, size = 'sm', children,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 最初のボタンにフォーカスを移す（なければパネル自体）
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus], button:not([disabled])');
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      // Tab でダイアログの外に出ないようにする
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open, closable]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-fl-3 safe-area">
      <div
        className="absolute inset-0 bg-slate-900/60"
        onClick={() => closable && onClose()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-full w-full flex-col overflow-hidden rounded-card bg-white shadow-2xl ${size === 'lg' ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="flex shrink-0 items-center gap-fl-2 border-b border-slate-200 px-fl-4 py-fl-3">
          {icon}
          <h2 id={titleId} className="flex-1 text-fl-xl font-black text-ink">{title}</h2>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="とじる"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-slate-100"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
        {children && (
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-fl-4 py-fl-3 text-fl-base text-ink">
            {children}
          </div>
        )}
        {actions && (
          <div className="flex shrink-0 flex-col gap-fl-2 border-t border-slate-100 px-fl-4 py-fl-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

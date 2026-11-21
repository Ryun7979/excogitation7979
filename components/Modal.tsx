import React from 'react';
import { XCircle, Info, CheckCircle } from 'lucide-react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'info' | 'success';
}

/** お知らせ・エラーを1つのボタンで閉じるダイアログ */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, message, type = 'info' }) => {
  const icon = type === 'error'
    ? <XCircle className="h-8 w-8 shrink-0 text-ng" aria-hidden="true" />
    : type === 'success'
      ? <CheckCircle className="h-8 w-8 shrink-0 text-ok" aria-hidden="true" />
      : <Info className="h-8 w-8 shrink-0 text-brand-accent" aria-hidden="true" />;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      actions={<Button variant={type === 'error' ? 'danger' : 'primary'} fullWidth onClick={onClose}>OK</Button>}
    >
      <p className="whitespace-pre-wrap font-bold leading-relaxed text-ink-muted">{message}</p>
    </Dialog>
  );
};

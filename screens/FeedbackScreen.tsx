import React from 'react';
import { BookOpen, ChevronRight, Loader2, MessageCircle } from 'lucide-react';
import { QuizQuestion } from '../types';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { RichText } from '../components/RichText';

interface FeedbackScreenProps {
  question: QuizQuestion;
  isCorrect: boolean;
  chosenIndex?: number;
  isLast: boolean;
  onNext: () => void;
  onShowDetail: () => void;
  detail: { open: boolean; loading: boolean; text: string; onClose: () => void };
}

const Block: React.FC<{ label: string; tone?: 'ok' | 'ng' | 'plain'; children: React.ReactNode }> = ({ label, tone = 'plain', children }) => (
  <div className={`rounded-btn p-fl-3 ${tone === 'ok' ? 'bg-ok-soft' : tone === 'ng' ? 'bg-ng-soft' : 'bg-surface-muted'}`}>
    <p className="mb-1 text-fl-xs font-black text-ink-muted">{label}</p>
    {children}
  </div>
);

export const FeedbackScreen: React.FC<FeedbackScreenProps> = ({
  question, isCorrect, chosenIndex, isLast, onNext, onShowDetail, detail,
}) => {
  return (
    <div className={`flex h-full justify-center p-fl-3 safe-area ${isCorrect ? 'bg-ok' : 'bg-ng'}`}>
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-white shadow-2xl">
        <h2
          className={`shrink-0 px-fl-4 pb-fl-2 pt-fl-3 text-center text-fl-3xl font-black ${isCorrect ? 'text-ok' : 'text-ng'}`}
          aria-live="assertive"
        >
          {isCorrect ? '◯ せいかい！' : '✕ ざんねん…'}
        </h2>

        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-fl-2 overflow-y-auto px-fl-4 pb-fl-3">
          {!isCorrect && chosenIndex !== undefined && question.options[chosenIndex] !== undefined && (
            <Block label="あなたのこたえ" tone="ng">
              <p className="select-text text-fl-lg font-black text-ink">{question.options[chosenIndex]}</p>
            </Block>
          )}
          <Block label="せいかい" tone="ok">
            <p className="select-text text-fl-xl font-black text-ink">{question.options[question.correctAnswerIndex]}</p>
          </Block>
          <Block label="かいせつ">
            <RichText text={question.explanation} className="select-text text-fl-base font-bold leading-relaxed text-ink" />
          </Block>
        </div>

        <div className="flex shrink-0 flex-col gap-fl-2 border-t border-slate-100 px-fl-4 py-fl-3 sm:flex-row-reverse short:flex-row-reverse">
          {/* Enter キーで次へ進めるよう、最初からフォーカスしておく */}
          <Button size="lg" onClick={onNext} autoFocus className="sm:flex-1 short:flex-1">
            {isLast ? 'けっかを見る' : 'つぎの問題へ'}<ChevronRight className="h-6 w-6" aria-hidden="true" />
          </Button>
          {!isCorrect && (
            <Button variant="secondary" onClick={onShowDetail} className="sm:flex-1 short:flex-1">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />くわしい解説
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={detail.open}
        onClose={detail.onClose}
        closable={!detail.loading}
        size="lg"
        title="AI先生のくわしい解説"
        icon={<BookOpen className="h-7 w-7 shrink-0 text-brand-accent" aria-hidden="true" />}
        actions={<Button fullWidth onClick={detail.onClose} disabled={detail.loading}>わかった！</Button>}
      >
        {detail.loading ? (
          <div className="flex flex-col items-center justify-center gap-fl-3 py-fl-4" role="status">
            <Loader2 className="h-12 w-12 animate-spin text-brand-accent" aria-hidden="true" />
            <p className="text-fl-lg font-black text-ink-muted">解説を考えているよ…</p>
          </div>
        ) : (
          <RichText text={detail.text} className="select-text text-fl-lg font-bold leading-relaxed" />
        )}
      </Dialog>
    </div>
  );
};

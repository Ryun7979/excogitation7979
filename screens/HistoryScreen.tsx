import React, { useMemo, useState } from 'react';
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react';
import { PlayRecord, WrongItem, collectWrongItems } from '../services/history';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';

interface HistoryScreenProps {
  history: PlayRecord[];
  onBack: () => void;
  onPracticeWrong: (items: WrongItem[]) => void;
  onClear: () => void;
}

const PRACTICE_COUNT = 10;
const CHART_COUNT = 20;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ history, onBack, onPracticeWrong, onClear }) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const wrongItems = useMemo(() => collectWrongItems(history, 50), [history]);
  // グラフは古い→新しいの順（右がいちばん新しい）
  const recent = history.slice(0, CHART_COUNT).reverse();
  const average = history.length > 0
    ? Math.round((history.reduce((s, r) => s + (r.total ? r.correct / r.total : 0), 0) / history.length) * 100)
    : 0;

  return (
    <div className="h-full pop-bg safe-area">
      <div className="thin-scrollbar h-full overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-fl-4 p-fl-4">
          <header className="flex items-center gap-fl-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />もどる
            </Button>
            <h1 className="text-fl-2xl font-black text-white">きろく</h1>
          </header>

          <section aria-labelledby="chart-title" className="rounded-card bg-white p-fl-3 shadow-xl">
            <div className="mb-fl-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="chart-title" className="text-fl-lg font-black text-ink">さいきんの点数</h2>
              <p className="text-fl-sm font-bold text-ink-muted">{history.length}回 あそんだ ・ 平均 {average}%</p>
            </div>
            {/* 棒グラフ（1本が1回分。高さは正解の割合） */}
            <ol className="flex h-40 items-end gap-1" aria-label="点数のうつりかわり（左が古い）">
              {recent.map(r => {
                const rate = r.total ? r.correct / r.total : 0;
                return (
                  <li
                    key={r.id}
                    className="flex h-full min-w-0 max-w-[2.5rem] flex-1 flex-col justify-end"
                    title={`${formatDate(r.at)} ${r.correct}/${r.total}${r.isReview ? '（ふくしゅう）' : ''}`}
                    aria-label={`${formatDate(r.at)} ${r.total}問中${r.correct}問${r.isReview ? '（ふくしゅう）' : ''}`}
                  >
                    <span className="mb-0.5 text-center text-[11px] font-bold text-ink-muted">{r.correct}</span>
                    <span
                      className={`block w-full rounded-t-md ${r.isReview ? 'bg-amber-400' : 'bg-brand-accent'}`}
                      style={{ height: `${Math.max(4, rate * 100)}%` }}
                    />
                  </li>
                );
              })}
            </ol>
            <p className="mt-fl-1 text-fl-xs font-bold text-ink-muted">
              <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-brand-accent align-middle" />ふつう
              <span className="ml-3 mr-1 inline-block h-3 w-3 rounded-sm bg-amber-400 align-middle" />ふくしゅう
            </p>
          </section>

          <section aria-labelledby="wrong-title" className="rounded-card bg-white p-fl-3 shadow-xl">
            <div className="mb-fl-2 flex flex-wrap items-center justify-between gap-fl-2">
              <h2 id="wrong-title" className="text-fl-lg font-black text-ink">まちがえた問題（{wrongItems.length}）</h2>
              {wrongItems.length > 0 && (
                <Button size="sm" onClick={() => onPracticeWrong(wrongItems.slice(0, PRACTICE_COUNT))}>
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  新しい順に{Math.min(PRACTICE_COUNT, wrongItems.length)}問とく
                </Button>
              )}
            </div>
            {wrongItems.length === 0 ? (
              <p className="text-fl-base font-bold text-ink-muted">まちがえた問題はまだないよ。</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {wrongItems.map((w, i) => (
                  <li key={i} className="py-fl-2">
                    <details className="group">
                      <summary className="cursor-pointer select-text text-fl-sm font-bold text-ink marker:text-brand-accent">
                        {w.question}
                      </summary>
                      <div className="mt-fl-1 select-text pl-4 text-fl-sm text-ink-muted">
                        <p className="font-bold">こたえ: <span className="text-ok-ink">{w.options[w.correctAnswerIndex]}</span></p>
                        {w.explanation && <p className="whitespace-pre-wrap">{w.explanation}</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-5 w-5" aria-hidden="true" />きろくを消す
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="きろくを消しますか？"
        actions={(
          <>
            <Button variant="secondary" fullWidth onClick={() => setConfirmClear(false)} data-autofocus>やめておく</Button>
            <Button variant="danger" fullWidth onClick={() => { setConfirmClear(false); onClear(); }}>消す</Button>
          </>
        )}
      >
        <p className="font-bold text-ink-muted">点数とまちがえた問題のきろくが、すべて消えるよ。もとにはもどせないよ。</p>
      </Dialog>
    </div>
  );
};

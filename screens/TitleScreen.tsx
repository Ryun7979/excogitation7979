import React from 'react';
import { BookOpen, Star, ImagePlus, ChevronRight, History } from 'lucide-react';
import { GameMode, TeacherType } from '../types';
import { Button } from '../components/Button';

interface TitleScreenProps {
  mode: GameMode;
  teacher: TeacherType;
  imageCount: number;
  imageUrls: string[];
  maxImages: number;
  historyCount: number;
  fastRetryEnabled: boolean;
  onModeChange: (mode: GameMode) => void;
  onTeacherChange: (teacher: TeacherType) => void;
  onImagesSelected: (files: File[]) => void;
  onStart: () => void;
  onOpenHistory: () => void;
  onToggleFastRetry: () => void;
}

const MODES = [
  { value: GameMode.STUDY, label: 'べんきょう', note: '教材の中身をおさらい', Icon: BookOpen },
  { value: GameMode.QUIZ, label: 'クイズ', note: '「へえ！」となる問題で遊ぶ', Icon: Star },
];

const TEACHERS = [
  { value: TeacherType.SUNAO, label: 'すなお先生', note: '教材の問題をそのまま出す', initial: 'す' },
  { value: TeacherType.AMANO, label: 'あまの先生', note: '数字や場面を変えた応用問題', initial: 'あ' },
];

/** 選んでいるものがはっきり分かる、大きな選択ボタン */
const ChoiceButton: React.FC<{
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  note: string;
}> = ({ selected, onClick, icon, label, note }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`flex min-h-[64px] items-center gap-fl-2 rounded-card border-4 p-fl-2 text-left transition-colors ${
      selected
        ? 'border-amber-400 bg-white text-ink shadow-[0_4px_0_#b45309]'
        : 'border-white/30 bg-white/10 text-white hover:bg-white/20'
    }`}
  >
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-fl-lg font-black ${selected ? 'bg-amber-100 text-amber-700' : 'bg-white/15 text-white'}`}>
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block text-fl-lg font-black leading-tight">{label}</span>
      <span className={`block text-fl-xs font-bold ${selected ? 'text-ink-muted' : 'text-white/85'}`}>{note}</span>
    </span>
  </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mb-fl-2 text-fl-base font-black text-white">{children}</h2>
);

export const TitleScreen: React.FC<TitleScreenProps> = ({
  mode, teacher, imageCount, imageUrls, maxImages, historyCount, fastRetryEnabled,
  onModeChange, onTeacherChange, onImagesSelected, onStart, onOpenHistory, onToggleFastRetry,
}) => {
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImagesSelected(Array.from(e.target.files));
    e.target.value = ''; // 同じ写真をえらび直しても反応するように
  };
  const PREVIEW_COUNT = 11;

  const fileInput = (
    <input type="file" multiple accept="image/*" onChange={handleFiles} className="sr-only" />
  );

  return (
    <div className="flex h-full flex-col pop-bg text-white safe-area">
      <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-fl-4 p-fl-4 md:grid-cols-[minmax(260px,2fr)_3fr] short:grid-cols-[minmax(240px,2fr)_3fr]">
          <div className="flex flex-col gap-fl-4">
            <header className="flex items-start justify-between gap-fl-2">
              <div>
                <h1 className="text-fl-3xl font-black tracking-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.2)]"><span className="text-amber-300">AI</span>クイズ</h1>
                <p className="text-fl-sm font-bold text-white/90">教材の写真から、4択クイズを作るよ</p>
              </div>
              {historyCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onOpenHistory} className="shrink-0 whitespace-nowrap">
                  <History className="h-5 w-5" aria-hidden="true" />きろく
                </Button>
              )}
            </header>

            <section aria-labelledby="mode-title">
              <SectionTitle><span id="mode-title">1. あそびかた</span></SectionTitle>
              <div className="grid grid-cols-1 gap-fl-2 min-[420px]:grid-cols-2 md:grid-cols-1 short:grid-cols-1">
                {MODES.map(m => (
                  <ChoiceButton
                    key={m.value}
                    selected={mode === m.value}
                    onClick={() => onModeChange(m.value)}
                    icon={<m.Icon className="h-6 w-6" aria-hidden="true" />}
                    label={m.label}
                    note={m.note}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="teacher-title">
              <SectionTitle><span id="teacher-title">2. 先生</span></SectionTitle>
              {mode === GameMode.QUIZ ? (
                <p className="rounded-card bg-white/10 p-fl-2 text-fl-sm font-bold text-white/90">
                  クイズでは先生はえらばないよ。いろいろな形の問題が出るよ。
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-fl-2 min-[420px]:grid-cols-2 md:grid-cols-1 short:grid-cols-1">
                  {TEACHERS.map(t => (
                    <ChoiceButton
                      key={t.value}
                      selected={teacher === t.value}
                      onClick={() => onTeacherChange(t.value)}
                      icon={t.initial}
                      label={t.label}
                      note={t.note}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="photo-title" className="flex flex-col">
            <SectionTitle>
              <span id="photo-title">3. 写真</span>
              <span className="ml-2 text-fl-xs font-bold text-white/85">（{maxImages}まいまで）</span>
            </SectionTitle>
            {imageCount === 0 ? (
              <label className="flex min-h-[min(45vmin,360px)] flex-1 cursor-pointer flex-col items-center justify-center gap-fl-2 rounded-card border-4 border-dashed border-white/70 bg-white/10 p-fl-4 text-center transition-colors hover:bg-white/20 focus-within:outline focus-within:outline-[3px] focus-within:outline-amber-400">
                {fileInput}
                <ImagePlus className="h-[clamp(3rem,10vmin,6rem)] w-[clamp(3rem,10vmin,6rem)]" aria-hidden="true" />
                <span className="text-fl-xl font-black">写真をえらぶ</span>
                <span className="text-fl-sm font-bold text-white/90">ドリルや教科書のページを撮った写真</span>
              </label>
            ) : (
              <div className="flex flex-1 flex-col gap-fl-2 rounded-card bg-white p-fl-2 text-ink">
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-4 lg:grid-cols-6" aria-label="えらんだ写真">
                  {imageUrls.slice(0, PREVIEW_COUNT).map((url, i) => (
                    <li key={url} className="aspect-square overflow-hidden rounded-lg bg-surface-muted">
                      <img src={url} className="h-full w-full object-cover" alt={`写真${i + 1}`} />
                    </li>
                  ))}
                  {imageCount > PREVIEW_COUNT && (
                    <li className="grid aspect-square place-items-center rounded-lg bg-surface-muted text-fl-base font-black text-ink-muted">
                      +{imageCount - PREVIEW_COUNT}
                    </li>
                  )}
                </ul>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-fl-2">
                  <p className="text-fl-base font-black">{imageCount}まい えらんだよ</p>
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-btn bg-surface-muted px-fl-3 text-fl-sm font-black text-ink hover:bg-slate-200 focus-within:outline focus-within:outline-[3px] focus-within:outline-amber-400">
                    {fileInput}
                    <ImagePlus className="h-5 w-5" aria-hidden="true" />えらびなおす
                  </label>
                </div>
                {imageCount > 20 && (
                  <p className="text-fl-xs font-bold text-ink-muted">
                    たくさんえらぶと、1回に使われない写真も出てくるよ。くり返し遊ぶと、まちがえた写真から多く出るよ。
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* スタートは画面の下に固定して、どの画面サイズでも見えるようにする */}
      <footer className="shrink-0 border-t border-white/20 bg-slate-900/30">
        <div className="mx-auto flex max-w-6xl items-center gap-fl-3 px-fl-4 py-fl-2">
          <button
            type="button"
            onClick={onToggleFastRetry}
            title="高速リトライ"
            aria-label={`高速リトライ機能を${fastRetryEnabled ? 'オフ' : 'オン'}にする（いま: ${fastRetryEnabled ? 'オン' : 'オフ'}）`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
          >
            <span className={`block h-2.5 w-2.5 rounded-full ${fastRetryEnabled ? 'bg-emerald-400' : 'bg-slate-900/60'}`} />
          </button>
          <p className="min-w-0 flex-1 text-fl-sm font-bold text-white/90">
            {imageCount === 0 ? '写真を1まい以上えらんでね' : 'じゅんびOK！'}
          </p>
          <Button size="lg" onClick={onStart} disabled={imageCount === 0} className="shrink-0">
            はじめる<ChevronRight className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>
      </footer>
    </div>
  );
};

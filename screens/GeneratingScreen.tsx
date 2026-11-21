import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface GeneratingScreenProps {
  message?: string;
  imageCount: number;
}

// 待っている間に読める、遊び方のヒント
const TIPS = [
  'まちがえた問題は、さいごに「もう一度」でとき直せるよ。',
  'こたえは キーボードの 1〜4 でもえらべるよ。',
  '上のランプを押すと、その問題からやり直せるよ。',
  'まちがえた問題は「きろく」にのこるよ。',
  'あまの先生は、数字や場面を変えた応用問題を出すよ。',
  'クイズモードは、教科書から一歩ジャンプした問題が出るよ。',
];

/** 問題を作っている間の画面。何をしていて、どのくらい待っているかを見せる */
export const GeneratingScreen: React.FC<GeneratingScreenProps> = ({ message, imageCount }) => {
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const tipTimer = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 7000);
    return () => {
      clearInterval(timer);
      clearInterval(tipTimer);
    };
  }, []);

  // ふだんは20〜40秒ほど。写真が多い・AIが混んでいると1分をこえることがある
  const hint = elapsed < 30
    ? `ふつうは 30秒くらい でできるよ`
    : elapsed < 60
      ? 'もう少しまってね'
      : 'AIがこみあっているみたい。もう少しまってね';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-fl-4 pop-bg p-fl-4 text-center text-white safe-area">
      <Loader2 className="h-[clamp(4rem,14vmin,8rem)] w-[clamp(4rem,14vmin,8rem)] animate-spin text-amber-300" aria-hidden="true" />
      <div role="status" aria-live="polite" className="max-w-2xl">
        <p className="text-fl-2xl font-black">{message ?? '準備中...'}</p>
        <p className="mt-fl-1 text-fl-base font-bold text-white/90">
          {imageCount}まいの写真から問題を作っているよ（{elapsed}秒）
        </p>
        <p className="text-fl-sm font-bold text-white/85">{hint}</p>
      </div>
      <p className="max-w-xl rounded-card bg-white/15 px-fl-4 py-fl-2 text-fl-sm font-bold">
        <span className="mr-2 rounded-full bg-amber-300 px-2 py-0.5 text-fl-xs font-black text-slate-900">ヒント</span>
        {TIPS[tipIndex]}
      </p>
    </div>
  );
};

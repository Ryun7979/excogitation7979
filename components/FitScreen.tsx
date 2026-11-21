import React, { useLayoutEffect, useRef } from 'react';

interface FitScreenProps {
  children: React.ReactNode;
  /** これより小さくは縮めない（文字が読めなくなるため）。これでも入らないときはスクロールする */
  minScale?: number;
}

// 少しでもはみ出していれば「スクロールが出る」とみなす（小数点の誤差は無視）
const OVERFLOW_TOLERANCE = 1;

/** 画面の中に、スクロールが出ている場所があるか */
const hasOverflow = (root: HTMLElement): boolean => {
  const targets = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  return targets.some(el => {
    if (el.scrollHeight - el.clientHeight <= OVERFLOW_TOLERANCE) return false;
    if (el === root) return true;
    // 長い一覧など、中でスクロールしてよい場所（data-fit-scroll）は数えない
    if (el.hasAttribute('data-fit-scroll')) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll';
  });
};

/**
 * 1画面に収めたい画面を包む。
 * 画面が小さくてスクロールが出るときは、全体を縮小して1画面に収める。
 * 縮小は「中身を大きな箱で並べてから、箱ごと縮める」方式なので、文字の折り返しも縮小後の広さに合う。
 */
export const FitScreen: React.FC<FitScreenProps> = ({ children, minScale = 0.6 }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let disposed = false;
    const apply = (s: number) => {
      inner.style.width = `${100 / s}%`;
      inner.style.height = `${100 / s}%`;
      inner.style.transform = s === 1 ? '' : `scale(${s})`;
    };
    const overflowsAt = (s: number) => {
      apply(s);
      return hasOverflow(inner);
    };

    // 描く前に測って縮めるので、はみ出した画面が一瞬見えることはない
    const fit = () => {
      if (disposed) return;
      let best = 1;
      if (overflowsAt(1)) {
        best = minScale;
        // 最小でも入らないときは、最小のままスクロールさせる。入るなら、入るいちばん大きい倍率を二分探索で探す
        if (!overflowsAt(minScale)) {
          let hi = 1;
          for (let i = 0; i < 7; i++) {
            const mid = (best + hi) / 2;
            if (overflowsAt(mid)) hi = mid;
            else best = mid;
          }
        }
      }
      apply(best);
      // 確かめやすいよう、いまの倍率を残しておく
      outer.dataset.fitScale = best.toFixed(3);
    };

    // 画面の大きさが変わったときは、その場で測り、次の描画でもう一度確かめる
    // （向きを変えた直後などは、文字の大きさが1拍おくれて決まることがあるため）
    let frame = 0;
    const fitNowAndLater = () => {
      fit();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    const resizeObserver = new ResizeObserver(fitNowAndLater);
    resizeObserver.observe(outer);
    window.addEventListener('resize', fitNowAndLater);
    // 問題が変わった・写真をえらんだなど、中身が変わったら測り直す
    const mutationObserver = new MutationObserver(fit);
    // （class だけを見る。縮めるときに変える style を見ると、測り直しがくり返されるため）
    mutationObserver.observe(inner, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
    });
    // 文字の形（Webフォント）が読み込まれると大きさが変わるので、測り直す
    document.fonts?.ready.then(fit).catch(() => {});

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fitNowAndLater);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [minScale]);

  return (
    <div ref={outerRef} className="h-full w-full overflow-hidden">
      <div ref={innerRef} className="h-full w-full origin-top-left">
        {children}
      </div>
    </div>
  );
};

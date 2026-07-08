// 1リクエストで送る画像枚数の段階制御。
// 遅延系エラー（タイムアウト・過負荷）が出たら1段減らし、
// 速く成功したら1段戻す。10問作るには最低5枚は確保したい。

export const IMAGE_BATCH_LEVELS = [20, 12, 8, 5];

const MIN_LEVEL = IMAGE_BATCH_LEVELS[IMAGE_BATCH_LEVELS.length - 1];

/** 1段減らす。最低段(5)より下には行かない。5未満（全数送信中）はそのまま */
export const stepDown = (current: number): number => {
  if (current < MIN_LEVEL) return current;
  for (const level of IMAGE_BATCH_LEVELS) {
    if (level < current) return level;
  }
  return MIN_LEVEL;
};

/** 1段戻す。最大段(20)より上には行かない */
export const stepUp = (current: number): number => {
  for (let i = IMAGE_BATCH_LEVELS.length - 1; i >= 0; i--) {
    if (IMAGE_BATCH_LEVELS[i] > current) return IMAGE_BATCH_LEVELS[i];
  }
  return IMAGE_BATCH_LEVELS[0];
};

/** 今回の開始枚数 = 前回までの適応値と実際に使える枚数の小さい方 */
export const initialBatchSize = (adaptive: number, available: number): number =>
  Math.min(adaptive, available);

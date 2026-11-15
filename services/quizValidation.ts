// AIの応答（JSON）から、ゲームで安全に出題できる問題だけを取り出す。
// スキーマ指定があってもモデルは問題数や選択肢数を守らないことがあり、
// そのまま使うと「10問目が存在しない」等で画面が落ちるため、ここで検証する。

import type { QuizQuestion } from "../types";

export const OPTION_COUNT = 4;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/** 1問分が出題可能な形か（問題文・4つの選択肢・正解インデックス） */
export const isPlayableQuestion = (q: any): boolean =>
  q != null &&
  typeof q === 'object' &&
  isNonEmptyString(q.question) &&
  Array.isArray(q.options) &&
  q.options.length === OPTION_COUNT &&
  q.options.every(isNonEmptyString) &&
  Number.isInteger(q.correctAnswerIndex) &&
  q.correctAnswerIndex >= 0 &&
  q.correctAnswerIndex < OPTION_COUNT;

// 「すべて正しい」「上のどれでもない」など、選択肢の位置や他の選択肢に依存するもの。
// これを含む問題は並べ替えると意味が崩れるので、そのままにする
const POSITION_DEPENDENT_OPTION = /すべて|全部|ぜんぶ|どれも|いずれも|以上|上の|両方|りょうほう/;

/**
 * 選択肢をシャッフルし、正解インデックスを付け替える。
 * AIは正解を1番目・2番目に置きがちで、位置から答えが読めてしまうため。
 */
export const shuffleOptions = <Q extends { options: string[]; correctAnswerIndex: number }>(
  q: Q,
  random: () => number = Math.random
): Q => {
  if (q.options.some(o => POSITION_DEPENDENT_OPTION.test(o))) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map(i => q.options[i]),
    correctAnswerIndex: order.indexOf(q.correctAnswerIndex),
  };
};

/**
 * 出題可能な問題だけを先頭から最大 total 問まで返す。
 * 解説が欠けていても出題はできるので空文字で補う。
 */
export const sanitizeQuestions = (
  data: unknown,
  total: number
): Omit<QuizQuestion, 'id'>[] => {
  if (!Array.isArray(data)) return [];
  return data
    .filter(isPlayableQuestion)
    .slice(0, total)
    .map((q: any) => ({
      ...q,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
    }));
};

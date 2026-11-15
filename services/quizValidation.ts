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

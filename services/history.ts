// 学習のきろく。1回遊ぶごとに点数とまちがえた問題をブラウザ（localStorage）に残す。
// 保存できない環境（プライベートブラウズ・容量切れ）でもゲームは止めない。

import type { KeyValueStorage } from './featureFlags';
import type { QuizQuestion } from '../types';

const STORAGE_KEY = 'ai-quiz:history:v1';
/** 残す回数の上限（古いものから消す） */
export const MAX_RECORDS = 50;

export interface WrongItem {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  chosenIndex?: number;
}

export interface PlayRecord {
  id: string;
  /** 遊んだ日時（ISO 8601） */
  at: string;
  mode: string;
  teacher: string;
  isReview: boolean;
  total: number;
  correct: number;
  wrong: WrongItem[];
}

const defaultStorage = (): KeyValueStorage | undefined => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

const isRecord = (r: any): r is PlayRecord =>
  r && typeof r === 'object' && typeof r.at === 'string' && typeof r.total === 'number' &&
  typeof r.correct === 'number' && Array.isArray(r.wrong);

/** 新しい順のきろく */
export const loadHistory = (storage = defaultStorage()): PlayRecord[] => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isRecord) : [];
  } catch {
    return [];
  }
};

/** 1回分を先頭に足して保存する。保存できたら true */
export const saveRecord = (record: PlayRecord, storage = defaultStorage()): boolean => {
  if (!storage) return false;
  let list = [record, ...loadHistory(storage)].slice(0, MAX_RECORDS);
  // 容量が足りなければ、古いきろくを減らしながらやり直す
  while (list.length > 0) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      if (list.length === 1) return false;
      list = list.slice(0, Math.ceil(list.length / 2));
    }
  }
  return false;
};

export const clearHistory = (storage = defaultStorage()): void => {
  try {
    storage?.setItem(STORAGE_KEY, '[]');
  } catch {
    // 消せなくても困らない
  }
};

/** 遊んだ結果から、きろく1回分を作る */
export const buildRecord = (params: {
  mode: string;
  teacher: string;
  isReview: boolean;
  questions: QuizQuestion[];
  results: { questionIndex: number; isCorrect: boolean; chosenIndex?: number }[];
  now?: Date;
}): PlayRecord => {
  const now = params.now ?? new Date();
  const wrong = params.results
    .filter(r => !r.isCorrect)
    .map(r => params.questions[r.questionIndex])
    .filter((q): q is QuizQuestion => !!q)
    .map((q, i) => ({
      question: q.question,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
      chosenIndex: params.results.filter(r => !r.isCorrect)[i]?.chosenIndex,
    }));
  return {
    id: `${now.getTime()}`,
    at: now.toISOString(),
    mode: params.mode,
    teacher: params.teacher,
    isReview: params.isReview,
    total: params.results.length,
    correct: params.results.filter(r => r.isCorrect).length,
    wrong,
  };
};

/**
 * きろくの中の、まちがえた問題（新しい順・同じ問題文は1つ）。
 * あとで正解した問題も、まちがえたことがあれば残す（苦手の目安として）
 */
export const collectWrongItems = (history: PlayRecord[], limit = Infinity): WrongItem[] => {
  const seen = new Set<string>();
  const out: WrongItem[] = [];
  for (const record of history) {
    for (const item of record.wrong) {
      const key = item.question.normalize('NFKC').replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
};

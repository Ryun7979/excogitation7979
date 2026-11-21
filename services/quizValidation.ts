// AIの応答（JSON）から、ゲームで安全に出題できる問題だけを取り出す。
// スキーマ指定があってもモデルは問題数や選択肢数を守らないことがあり、
// そのまま使うと「10問目が存在しない」等で画面が落ちるため、ここで検証する。

import type { QuizQuestion } from "../types";

export const OPTION_COUNT = 4;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

// 空白や全角/半角の違いだけの選択肢も「同じ」とみなす
const normalizeOption = (o: string): string => o.normalize('NFKC').replace(/\s+/g, '');

/** 選択肢がすべて異なるか（AIが「利益・利益・公益・利益」のように重複させることがある） */
export const hasDistinctOptions = (options: string[]): boolean =>
  new Set(options.map(normalizeOption)).size === options.length;

/** 1問分が出題可能な形か（問題文・4つの異なる選択肢・正解インデックス） */
export const isPlayableQuestion = (q: any): boolean =>
  q != null &&
  typeof q === 'object' &&
  isNonEmptyString(q.question) &&
  Array.isArray(q.options) &&
  q.options.length === OPTION_COUNT &&
  q.options.every(isNonEmptyString) &&
  hasDistinctOptions(q.options) &&
  Number.isInteger(q.correctAnswerIndex) &&
  q.correctAnswerIndex >= 0 &&
  q.correctAnswerIndex < OPTION_COUNT;

// 元の教材そのものを指す言葉。子供は教材を見ずに遊ぶので、これを含む問題は捨てる。
// 「ネットワーク」「チームワーク」などは対象外にするため、カタカナに続く「ワーク」は除く
const MATERIAL_REFERENCE = /(?<![ァ-ヶー])ワーク|ドリル|教材|プリント|画像/;

/** 問題文が元の教材（ワーク・ドリル・画像など）を指しているか */
export const refersToMaterial = (q: any): boolean =>
  typeof q?.question === 'string' && MATERIAL_REFERENCE.test(q.question);

// 丸写し判定用の正規化: 全角/半角・空白・記号のゆれをなくす
const normalizeForCopy = (s: string): string =>
  s.normalize('NFKC').replace(/[\s=＝?？。、,.「」『』()（）□]/g, '').replace(/[x*]/g, '×');

/**
 * あまの先生の問題が、元画像の問題の丸写しになっていないか。
 * AIが先に書いた originalContent（元の問題・数値・語句）の各項目が、問題文にそのまま
 * 含まれていたら丸写しとみなす（例: 元「5+60」→ 問題「5 + 60 はいくつですか」）。
 * 誤判定で正しい問題を捨てないよう、計算式（7×4 など）か、8文字以上の項目だけを比べる。
 * 年号（1603年）や短い語句は、応用問題でも使うのが自然なので比べない（捨てすぎると問題が足りなくなる）
 */
export const copiesOriginal = (q: any): boolean => {
  if (typeof q?.originalContent !== 'string' || typeof q?.question !== 'string') return false;
  const question = normalizeForCopy(q.question);
  return q.originalContent
    .split(/[、,，/／\n;；]/)
    .map(normalizeForCopy)
    .filter((piece: string) => (piece.length >= 3 && /\d[+\-−×÷/]\d/.test(piece)) || piece.length >= 8)
    .some((piece: string) => question.includes(piece));
};

/**
 * 同じ問題とみなすためのキー（正解＋選択肢の組）。
 * 「黄色を表す英単語は？」と「レモンの色を表す英単語は？」のように
 * 問題文の言い回しだけ違う重複も、正解と選択肢が同じなら同じ問題とみなす
 */
const duplicateKey = (q: any): string =>
  `${normalizeOption(q.options[q.correctAnswerIndex])}|${q.options.map(normalizeOption).sort().join('/')}`;

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
 * AIが先に書いた正解(answer)と選択肢を照合し、correctAnswerIndex を付け直す。
 * 軽量モデルは途中式で正しく 61+9=70 と出しても、正解番号では 69 を指すことがあるため。
 * answer が選択肢のどれとも一致しない問題は、正解がどれか確定できないので除外する（null を返す）。
 * answer が無い応答（古い形式など）はそのまま通す。
 */
export const reconcileAnswer = (q: any): any => {
  if (q == null || typeof q !== 'object' || !isNonEmptyString(q.answer) || !Array.isArray(q.options)) {
    return q;
  }
  const target = normalizeOption(q.answer);
  const index = q.options.findIndex((o: unknown) => typeof o === 'string' && normalizeOption(o) === target);
  if (index < 0) return null;
  return { ...q, correctAnswerIndex: index };
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
  const seen = new Set<string>();
  return data
    .map(reconcileAnswer)
    .filter(isPlayableQuestion)
    .filter(q => !refersToMaterial(q))
    .filter(q => !copiesOriginal(q))
    .filter(q => {
      const key = duplicateKey(q);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, total)
    .map((q: any) => ({
      ...q,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
    }));
};

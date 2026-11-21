// 画面側とサーバー側（中継API）の両方で使う、AIモデルとスキーマの定数。
// 画面側に @google/genai を読み込まないよう、SDK の列挙値と同じ文字列をここで持つ。

// 2.0系は提供終了(404)。'-latest'系エイリアスは中身が勝手に変わり、応答が返らないこともあるため
// バージョン固定名を使う。世代(3.5/2.5)を交互に並べ、片方の混雑時にもう片方へ逃がす
export const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const;

/** 中継APIが受け付けるモデル（これ以外の名前は400で断る） */
export const ALLOWED_MODELS: readonly string[] = FALLBACK_MODELS;

/** SDK の Type 列挙と同じ値（responseSchema 用） */
export const Type = {
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT',
  BOOLEAN: 'BOOLEAN',
} as const;

/** SDK の ThinkingLevel 列挙と同じ値 */
export const ThinkingLevel = {
  MINIMAL: 'MINIMAL',
} as const;

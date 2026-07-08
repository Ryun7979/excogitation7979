// 画像(Fileオブジェクト参照)ごとにAI解析結果テキストをキャッシュする。
// 同じFile参照が再び使われたとき（モデル切替リトライ・枚数を減らした再試行・
// 「もういちど」再プレイ等）、画像を再送・再解析せずに済む。

let cache = new WeakMap<File, string>();

export const getCachedAnalysis = (file: File): string | undefined => cache.get(file);

export const setCachedAnalysis = (file: File, analysis: string): void => {
  cache.set(file, analysis);
};

/** テスト専用: キャッシュを空にする */
export const resetAnalysisCacheForTest = (): void => {
  cache = new WeakMap<File, string>();
};

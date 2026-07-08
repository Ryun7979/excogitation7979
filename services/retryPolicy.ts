// 一時的な障害（混雑・過負荷・タイムアウト・応答の途切れ）かどうかを判定する。
// true なら、待って再試行するか別モデルへフォールバックする価値がある。

/** 空応答など、アプリ側で「再試行の価値あり」と明示するためのエラー */
export class RetryableError extends Error { }

const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

// SDK のリトライ枯渇後は status を持たない Error になるため、メッセージでも判定する。
// abort は SDK の httpOptions.timeout 発火時（AbortController経由）に出る
const RETRYABLE_MESSAGE = /\b(408|429|500|502|503|504)\b|overloaded|unavailable|resource[_ ]exhausted|deadline|timed?[ _]?out|abort|retryable http error|fetch failed|network/i;

// 「リクエストが重くて処理しきれない」可能性があるエラー（タイムアウト・過負荷・5xx）。
// このときは送信画像を減らす価値がある。429（クォータ）や認証エラーは枚数と無関係
const SLOWDOWN_MESSAGE = /\b(408|500|502|503|504)\b|overloaded|unavailable|deadline|timed?[ _]?out|abort/i;

/** 送信データを軽くすれば成功しうる「遅い・重い」系のエラーか */
export const isSlowdownError = (e: unknown): boolean => {
  const err = e as { status?: unknown; message?: unknown } | null | undefined;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status !== undefined) return status === 408 || status >= 500;
  return SLOWDOWN_MESSAGE.test(String(err?.message ?? ''));
};

/** エラーモーダル等に表示する、失敗理由の短い日本語説明を返す */
export const describeApiError = (e: unknown): string => {
  const err = e as { status?: unknown; message?: unknown } | null | undefined;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const msg = String(err?.message ?? '');

  if (/api key/i.test(msg)) return 'APIキーが正しく設定されていません';
  if (status === 429 || /\b429\b|resource[_ ]exhausted|quota/i.test(msg)) {
    return 'AIの利用上限（クォータ）に達しました (429)';
  }
  if (status === 503 || /\b503\b|overloaded|unavailable/i.test(msg)) {
    return 'AIサーバーが混雑しています (503)';
  }
  if (status !== undefined && status >= 500) {
    return `AIサーバー側で一時的なエラーが発生しました (${status})`;
  }
  if (status === 408 || /timed?[ _]?out|deadline|abort/i.test(msg)) {
    return '通信がタイムアウトしました';
  }
  if (/fetch failed|network/i.test(msg)) {
    return 'ネットワークに接続できませんでした';
  }
  if (e instanceof SyntaxError) {
    return 'AIの応答が壊れていました（途中で切れた可能性）';
  }
  if (msg === '') return '不明なエラーが発生しました';

  const detail = msg.length > 150 ? `${msg.slice(0, 150)}…` : msg;
  const prefix = status !== undefined ? `(${status}) ` : '';
  return `${prefix}${detail}`;
};

export const isRetryableApiError = (e: unknown): boolean => {
  if (e instanceof RetryableError) return true;
  // JSONパース失敗＝応答が途中で切れた可能性が高い
  if (e instanceof SyntaxError) return true;

  const err = e as { status?: unknown; message?: unknown } | null | undefined;
  if (typeof err?.status === 'number') {
    return RETRYABLE_STATUS.includes(err.status);
  }
  return RETRYABLE_MESSAGE.test(String(err?.message ?? ''));
};

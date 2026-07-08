import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableApiError, isSlowdownError, RetryableError, describeApiError } from './retryPolicy.ts';

test('429（クォータ超過）はリトライ対象', () => {
  assert.equal(isRetryableApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), true);
});

test('503（モデル過負荷）はリトライ対象', () => {
  assert.equal(isRetryableApiError({ status: 503, message: 'The model is overloaded. Please try again later.' }), true);
});

test('500/502/504 もリトライ対象', () => {
  for (const status of [500, 502, 504]) {
    assert.equal(isRetryableApiError({ status, message: 'server error' }), true, `status=${status}`);
  }
});

test('400（不正リクエスト）と 403/404 はリトライしない', () => {
  for (const status of [400, 403, 404]) {
    assert.equal(isRetryableApiError({ status, message: 'client error' }), false, `status=${status}`);
  }
});

test('statusが無くてもメッセージから503系を判定できる（SDKリトライ枯渇後のエラー）', () => {
  assert.equal(isRetryableApiError(new Error('Retryable HTTP Error: Service Unavailable')), true);
  assert.equal(isRetryableApiError(new Error('The model is overloaded.')), true);
  assert.equal(isRetryableApiError(new Error('got status: 429 . {"error":{}}')), true);
});

test('ネットワーク断・タイムアウトはリトライ対象', () => {
  assert.equal(isRetryableApiError(new TypeError('fetch failed')), true);
  assert.equal(isRetryableApiError(new Error('Request timed out')), true);
});

test('JSONパース失敗（途切れた応答）はリトライ対象', () => {
  let parseError: unknown;
  try {
    JSON.parse('[{"question": "途中で切れた');
  } catch (e) {
    parseError = e;
  }
  assert.equal(isRetryableApiError(parseError), true);
});

test('RetryableError（空応答など）はリトライ対象', () => {
  assert.equal(isRetryableApiError(new RetryableError('AIの応答が空でした')), true);
});

test('APIキー無効などその他のエラーはリトライしない', () => {
  assert.equal(isRetryableApiError(new Error('API key not valid. Please pass a valid API key.')), false);
  assert.equal(isRetryableApiError(null), false);
  assert.equal(isRetryableApiError(undefined), false);
});

test('タイムアウトによるAbortErrorはリトライ対象', () => {
  // SDKのhttpOptions.timeoutはAbortController.abort()を使う
  const abortError = new DOMException('The operation was aborted.', 'AbortError');
  assert.equal(isRetryableApiError(abortError), true);
});

// --- isSlowdownError: 送信画像を減らす価値がある「重い/遅い」系エラーか ---

test('isSlowdownError: タイムアウト・Abortは遅延系', () => {
  assert.equal(isSlowdownError(new DOMException('The operation was aborted.', 'AbortError')), true);
  assert.equal(isSlowdownError(new Error('Request timed out')), true);
});

test('isSlowdownError: 503（過負荷）・500系は遅延系', () => {
  assert.equal(isSlowdownError({ status: 503, message: 'The model is overloaded.' }), true);
  assert.equal(isSlowdownError({ status: 500, message: 'Internal error' }), true);
});

test('isSlowdownError: 429（クォータ）や認証エラーは遅延系ではない', () => {
  assert.equal(isSlowdownError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), false);
  assert.equal(isSlowdownError({ status: 400, message: 'API key not valid.' }), false);
  assert.equal(isSlowdownError(null), false);
});

// --- describeApiError: エラーモーダルに表示する原因説明 ---

test('describeApiError: Abort（タイムアウト）が説明される', () => {
  const abortError = new DOMException('The operation was aborted.', 'AbortError');
  assert.match(describeApiError(abortError), /タイムアウト/);
});

test('describeApiError: 429は利用上限として説明される', () => {
  const desc = describeApiError({ status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded' });
  assert.match(desc, /利用上限/);
  assert.match(desc, /429/);
});

test('describeApiError: 503は混雑として説明される', () => {
  const desc = describeApiError({ status: 503, message: 'The model is overloaded.' });
  assert.match(desc, /混雑/);
  assert.match(desc, /503/);
});

test('describeApiError: 500系はサーバー側の一時的エラーとして説明される', () => {
  assert.match(describeApiError({ status: 500, message: 'Internal error' }), /サーバー/);
  assert.match(describeApiError({ status: 500, message: 'Internal error' }), /500/);
});

test('describeApiError: APIキー無効は設定の問題として説明される', () => {
  const desc = describeApiError({ status: 400, message: 'API key not valid. Please pass a valid API key.' });
  assert.match(desc, /APIキー/);
});

test('describeApiError: タイムアウトが説明される', () => {
  assert.match(describeApiError(new Error('Request timed out')), /タイムアウト/);
});

test('describeApiError: ネットワーク断が説明される', () => {
  assert.match(describeApiError(new TypeError('fetch failed')), /ネットワーク/);
});

test('describeApiError: 壊れたJSON応答が説明される', () => {
  let parseError: unknown;
  try {
    JSON.parse('[{"question": "途中で切れた');
  } catch (e) {
    parseError = e;
  }
  assert.match(describeApiError(parseError), /応答/);
});

test('describeApiError: 未知のエラーは元のメッセージを含める', () => {
  const desc = describeApiError(new Error('something unexpected happened'));
  assert.match(desc, /something unexpected happened/);
});

test('describeApiError: 長いメッセージは切り詰められる', () => {
  const desc = describeApiError(new Error('x'.repeat(500)));
  assert.ok(desc.length <= 220, `too long: ${desc.length}`);
});

test('describeApiError: null/undefinedでも壊れない', () => {
  assert.equal(typeof describeApiError(null), 'string');
  assert.equal(typeof describeApiError(undefined), 'string');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateContent } from './aiClient.ts';
import { isRetryableApiError, isSlowdownError } from './retryPolicy.ts';

const fakeFetch = (status: number, body: unknown, asJson = true): typeof fetch =>
  (async () => new Response(asJson ? JSON.stringify(body) : String(body), { status })) as typeof fetch;

test('成功したら text を返す', async () => {
  const r = await generateContent({ model: 'm', contents: 'x' }, fakeFetch(200, { text: 'hi' }));
  assert.equal(r.text, 'hi');
});

test('Gemini 側の503は status:503 のエラーになり、再試行の対象', async () => {
  await assert.rejects(
    generateContent({ model: 'm', contents: 'x' }, fakeFetch(503, { error: { message: 'overloaded', status: 503 } })),
    (e: any) => e.status === 503 && isRetryableApiError(e) && isSlowdownError(e),
  );
});

test('status の無いエラー（タイムアウト等）はメッセージで判定される', async () => {
  await assert.rejects(
    generateContent({ model: 'm', contents: 'x' }, fakeFetch(502, { error: { message: 'request aborted' } })),
    (e: any) => e.status === undefined && isRetryableApiError(e),
  );
});

test('中継APIまで届かず JSON でない応答（504のエラーページ等）は HTTP の状態コードを使う', async () => {
  await assert.rejects(
    generateContent({ model: 'm', contents: 'x' }, fakeFetch(504, '<html>Gateway Timeout</html>', false)),
    (e: any) => e.status === 504 && isRetryableApiError(e),
  );
});

test('413（大きすぎ）は画像を減らして再試行する対象', async () => {
  await assert.rejects(
    generateContent({ model: 'm', contents: 'x' }, fakeFetch(413, 'Request Entity Too Large', false)),
    (e: any) => e.status === 413 && isRetryableApiError(e) && isSlowdownError(e),
  );
});

test('APIキー未設定は再試行しない', async () => {
  await assert.rejects(
    generateContent({ model: 'm', contents: 'x' }, fakeFetch(500, { error: { message: 'サーバーに GEMINI_API_KEY が設定されていません (API key not configured)' } })),
    (e: any) => !isRetryableApiError(e),
  );
});

test('ネットワークにつながらない（Failed to fetch）は再試行の対象', () => {
  assert.equal(isRetryableApiError(new TypeError('Failed to fetch')), true);
  assert.equal(isRetryableApiError(new TypeError('Load failed')), true);
});

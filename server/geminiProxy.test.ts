import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGeminiProxy, createRateLimiter } from './geminiProxy.js';

const ok = () => true;
const okGenerate = async () => ({ text: '[]' });

test('APIキーが無いと500で断る', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-flash', contents: 'x' }, { apiKey: undefined, clientId: 'a', rateLimiter: ok, generate: okGenerate });
  assert.equal(r.status, 500);
  assert.match((r.body as any).error.message, /API key/);
});

test('決めたモデル以外は400で断る', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-pro', contents: 'x' }, { apiKey: 'k', clientId: 'a', rateLimiter: ok, generate: okGenerate });
  assert.equal(r.status, 400);
});

test('contents が無いと400', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-flash' }, { apiKey: 'k', clientId: 'a', rateLimiter: ok, generate: okGenerate });
  assert.equal(r.status, 400);
});

test('正しい要求は text を返し、決めた config の項目だけを渡す', async () => {
  let passed: any;
  const r = await handleGeminiProxy(
    { model: 'gemini-2.5-flash', contents: 'x', config: { responseMimeType: 'application/json', systemInstruction: '悪用', tools: [{}] } },
    { apiKey: 'k', clientId: 'a', rateLimiter: ok, generate: async (req) => { passed = req; return { text: 'hello' }; } },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { text: 'hello' });
  assert.deepEqual(passed.config, { responseMimeType: 'application/json' });
});

test('Gemini の状態コード（503）をそのまま返す', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-flash', contents: 'x' }, {
    apiKey: 'k', clientId: 'a', rateLimiter: ok,
    generate: async () => { throw Object.assign(new Error('The model is overloaded'), { status: 503 }); },
  });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: { message: 'The model is overloaded', status: 503 } });
});

test('状態コードの無いエラーは502で、status を付けずにメッセージを返す', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-flash', contents: 'x' }, {
    apiKey: 'k', clientId: 'a', rateLimiter: ok,
    generate: async () => { throw new Error('request aborted'); },
  });
  assert.equal(r.status, 502);
  assert.deepEqual(r.body, { error: { message: 'request aborted' } });
});

test('回数制限を超えると429', async () => {
  const r = await handleGeminiProxy({ model: 'gemini-2.5-flash', contents: 'x' }, { apiKey: 'k', clientId: 'a', rateLimiter: () => false, generate: okGenerate });
  assert.equal(r.status, 429);
});

test('createRateLimiter: 上限まで通し、時間がたてばまた通す', () => {
  let t = 0;
  const limit = createRateLimiter({ windowMs: 1000, max: 2 }, () => t);
  assert.equal(limit('ip'), true);
  assert.equal(limit('ip'), true);
  assert.equal(limit('ip'), false);
  assert.equal(limit('other'), true, '別のIPは別に数える');
  t = 1000;
  assert.equal(limit('ip'), true);
});

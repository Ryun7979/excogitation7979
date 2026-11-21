// Vercel の関数: POST /api/gemini
// APIキーは Vercel の環境変数 GEMINI_API_KEY に置く（VITE_ を付けない）。

import { handleGeminiProxy, MAX_BODY_BYTES } from '../server/geminiProxy.js';

export const maxDuration = 60;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function POST(request: Request): Promise<Response> {
  // 公開先を決めている場合は、ほかのサイトからの呼び出しを断る（ALLOWED_ORIGINS はカンマ区切り）
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin');
  if (allowed.length > 0 && origin && !allowed.includes(origin)) {
    return json(403, { error: { message: 'このサイトからは使えません', status: 403 } });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return json(413, { error: { message: '送るデータが大きすぎます (payload too large)', status: 413 } });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: { message: 'JSON が正しくありません', status: 400 } });
  }

  const clientId = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const result = await handleGeminiProxy(body, { apiKey: process.env.GEMINI_API_KEY, clientId });
  return json(result.status, result.body);
}

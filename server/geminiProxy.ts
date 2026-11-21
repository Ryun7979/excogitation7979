// Gemini を呼ぶ中継API の中身。APIキーはサーバー側だけで持ち、画面側には渡さない。
// Vercel の関数（api/gemini.ts）と、開発サーバー（vite.config.ts）の両方から使う。

import { GoogleGenAI } from '@google/genai';
import { ALLOWED_MODELS } from '../services/aiModels.js';

/** 1リクエストの本文の上限。Vercel の関数は 4.5MB までしか受け取れない */
export const MAX_BODY_BYTES = 4_400_000;

// SDK の retryOptions は使わない（エラーが AbortError に包み直されて元の状態コードが消えるため）。
// 混雑時のリトライは画面側の withModelFallback で行う
const UPSTREAM_TIMEOUT_MS = 45_000;

// 画面側から受け付ける config の項目（これ以外は捨てる）
const ALLOWED_CONFIG_KEYS = ['responseMimeType', 'responseSchema', 'thinkingConfig'] as const;

export interface ProxyResult {
  status: number;
  body: { text: string } | { error: { message: string; status?: number } };
}

const fail = (status: number, message: string, upstreamStatus?: number): ProxyResult => ({
  status,
  body: { error: { message, ...(upstreamStatus !== undefined ? { status: upstreamStatus } : {}) } },
});

// --- 簡単な回数制限（IPごと） ---
// サーバーレスではインスタンスごとの記録になるので、完全ではない「歯止め」。
// クイズ1回の生成で、混雑時のモデル切り替えを含めて最大十数回呼ぶため、余裕を持たせる
export const RATE_LIMIT = { windowMs: 10 * 60_000, max: 120 };

export const createRateLimiter = (limit = RATE_LIMIT, now: () => number = Date.now) => {
  const hits = new Map<string, number[]>();
  return (clientId: string): boolean => {
    const t = now();
    const recent = (hits.get(clientId) ?? []).filter(at => t - at < limit.windowMs);
    if (recent.length >= limit.max) {
      hits.set(clientId, recent);
      return false;
    }
    recent.push(t);
    hits.set(clientId, recent);
    // 記録が増えすぎないよう、ときどき古い記録を掃除する
    if (hits.size > 5000) {
      for (const [id, times] of hits) {
        if (times.every(at => t - at >= limit.windowMs)) hits.delete(id);
      }
    }
    return true;
  };
};

const defaultLimiter = createRateLimiter();

export interface ProxyOptions {
  apiKey: string | undefined;
  clientId: string;
  rateLimiter?: (clientId: string) => boolean;
  /** テスト用: Gemini 呼び出しの差し替え */
  generate?: (req: { model: string; contents: unknown; config: Record<string, unknown> }) => Promise<{ text?: string }>;
}

/** 画面側の要求の形を確かめ、Gemini に中継する */
export const handleGeminiProxy = async (body: unknown, opts: ProxyOptions): Promise<ProxyResult> => {
  if (!opts.apiKey) {
    return fail(500, 'サーバーに GEMINI_API_KEY が設定されていません (API key not configured)');
  }
  if (!(opts.rateLimiter ?? defaultLimiter)(opts.clientId)) {
    return fail(429, '短い時間にたくさん使われたため、少し待ってからためしてね (rate limited)', 429);
  }

  const req = body as { model?: unknown; contents?: unknown; config?: unknown } | null;
  if (!req || typeof req !== 'object') return fail(400, 'リクエストの形が正しくありません', 400);
  if (typeof req.model !== 'string' || !ALLOWED_MODELS.includes(req.model)) {
    return fail(400, `使えないモデルです: ${String(req.model)}`, 400);
  }
  if (req.contents === undefined || req.contents === null) {
    return fail(400, 'contents がありません', 400);
  }

  const rawConfig = (req.config && typeof req.config === 'object') ? req.config as Record<string, unknown> : {};
  const config: Record<string, unknown> = {};
  for (const key of ALLOWED_CONFIG_KEYS) {
    if (rawConfig[key] !== undefined) config[key] = rawConfig[key];
  }

  const generate = opts.generate ?? (async (r) => {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: UPSTREAM_TIMEOUT_MS } });
    const res = await ai.models.generateContent(r as Parameters<typeof ai.models.generateContent>[0]);
    return { text: res.text };
  });

  try {
    const res = await generate({ model: req.model, contents: req.contents, config });
    return { status: 200, body: { text: res.text ?? '' } };
  } catch (e) {
    const err = e as { status?: unknown; message?: unknown };
    const upstreamStatus = typeof err?.status === 'number' ? err.status : undefined;
    const message = String(err?.message ?? e);
    // 状態コードの無いエラー（タイムアウト等）は 502 で返し、メッセージで原因を伝える
    return fail(upstreamStatus ?? 502, message, upstreamStatus);
  }
};

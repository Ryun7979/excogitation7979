// 画面側から Gemini を呼ぶ窓口。APIキーは持たず、中継API（/api/gemini）を通す。
// エラーは SDK と同じく { status, message } を持つ形で投げ、retryPolicy がそのまま判定できるようにする。

export interface GenerateRequest {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

// サーバー側の Gemini 呼び出し（45秒）より少し長く待つ
const CLIENT_TIMEOUT_MS = 50_000;

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const generateContent = async (
  req: GenerateRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl('/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new ApiError('request timed out (aborted)');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // 中継APIまで届かなかった（ホスティング側のエラーページ等）
  }
  if (!res.ok) {
    const message = data?.error?.message ?? `中継APIがエラーを返しました (${res.status})`;
    // 中継API自体の状態コードではなく、Gemini 側の状態コードを優先する（無ければ status なし）
    const status = typeof data?.error?.status === 'number' ? data.error.status : (data ? undefined : res.status);
    throw new ApiError(message, status);
  }
  return { text: typeof data?.text === 'string' ? data.text : '' };
};

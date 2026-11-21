import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleGeminiProxy, MAX_BODY_BYTES } from './server/geminiProxy.js';

// 開発サーバーでも本番（api/gemini.ts）と同じ中継API /api/gemini を動かす。
// APIキーは .env.local の GEMINI_API_KEY から読み、画面側のコードには渡さない。
const geminiDevProxy = (apiKey: string | undefined): Plugin => ({
  name: 'gemini-dev-proxy',
  configureServer(server) {
    server.middlewares.use('/api/gemini', (req, res) => {
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'POST') return send(405, { error: { message: 'POST only', status: 405 } });

      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
      });
      req.on('end', async () => {
        if (size > MAX_BODY_BYTES) {
          return send(413, { error: { message: '送るデータが大きすぎます (payload too large)', status: 413 } });
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { error: { message: 'JSON が正しくありません', status: 400 } });
        }
        const result = await handleGeminiProxy(body, {
          apiKey,
          clientId: req.socket.remoteAddress ?? 'local',
          rateLimiter: () => true, // 開発中は制限しない
        });
        send(result.status, result.body);
      });
    });
  },
});

export default defineConfig(({ mode }) => {
  // .env / .env.local を読む（接頭辞なしの値も読むため第3引数は ''）
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), geminiDevProxy(env.GEMINI_API_KEY)],
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
    },
  };
});

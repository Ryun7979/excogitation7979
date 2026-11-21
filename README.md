# AIクイズ — 写真から4択クイズ

教材（ドリル・教科書など）の写真から、AI（Gemini）が4択クイズを作るアプリです。

## 手元で動かす

**必要なもの:** Node.js 22.6 以上

1. `npm install`
2. `.env.local` に Gemini の API キーを書く（`VITE_` は付けない。キーは画面側には渡らない）

   ```
   GEMINI_API_KEY=ここにキー
   ```

3. `npm run dev`

テストは `npm test` で動きます。

## ドキュメント

- [docs/README.md](docs/README.md) — ドキュメントの入口
- [docs/deploy.md](docs/deploy.md) — しくみと公開のしかた（Vercel）
- [docs/tasks/README.md](docs/tasks/README.md) — 改善タスクの一覧と経過

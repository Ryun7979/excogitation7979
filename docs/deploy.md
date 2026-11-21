# 動かし方・公開のしかた

## しくみ

```
ブラウザ（画面）──POST /api/gemini──▶ 中継API ──▶ Gemini API
                                     └ APIキーはここだけ（GEMINI_API_KEY）
```

- 画面側のコードは API キーを持たない。Gemini は必ず中継API `/api/gemini` を通して呼ぶ（[services/aiClient.ts](../services/aiClient.ts)）。
- 中継APIの中身は [server/geminiProxy.ts](../server/geminiProxy.ts)。
  - 本番（Vercel）: [api/gemini.ts](../api/gemini.ts) が関数として動く。
  - 開発中: [vite.config.ts](../vite.config.ts) のプラグインが、開発サーバーの中で同じものを動かす。
- 中継APIの歯止め
  - 使えるモデルは [services/aiModels.ts](../services/aiModels.ts) の `ALLOWED_MODELS` だけ。
  - 画面から受け取る設定は `responseMimeType`・`responseSchema`・`thinkingConfig` だけ。
  - 本文は 4.4MB まで（Vercel の関数の上限 4.5MB のため）。超えると 413 になり、画面側が画像の枚数を減らして再試行する。
  - IP ごとに 10分 120回まで（サーバーのインスタンスごとの記録なので目安）。

## 手元で動かす

1. `npm install`
2. `.env.local` に API キーを書く（`VITE_` は付けない）

   ```
   GEMINI_API_KEY=ここにキー
   ```

3. `npm run dev`

テストは `npm test`、型チェックとビルドは `npm run build`。

## Vercel で公開する

1. Vercel のプロジェクト設定 → Environment Variables に `GEMINI_API_KEY` を登録する。
2. **以前の `VITE_GEMINI_API_KEY` / `API_KEY` は消す**（残っていても今のコードは使わないが、混乱のもとになる）。
3. ほかのサイトから中継APIを呼ばせたくない場合は `ALLOWED_ORIGINS` に公開URLを書く（例: `https://example.vercel.app`。カンマ区切りで複数可）。
4. デプロイしたら、クイズを1回作れることを確かめる。

### 公開済みのキーについて

この変更より前に公開していたページでは、キーがJSの中に入っていた。
**念のため Google AI Studio でキーを作り直し（古いキーは削除）、新しいキーを `GEMINI_API_KEY` に登録する**ことをおすすめする。

# T01 APIキーをサーバー側に移す

- 優先度: 高
- 状態: ✅ 完了（Vercel での動作確認は公開時に）

## 背景

`services/geminiService.ts` が `import.meta.env.VITE_GEMINI_API_KEY` を直接使っている。
`VITE_` で始まる値は公開されるJSにそのまま埋め込まれるので、公開したページから誰でもキーを抜き出して使える。

## やること

- Gemini を呼ぶ中継API（`/api/gemini`）を作り、キーはサーバー側の環境変数 `GEMINI_API_KEY` だけに置く。
- 画面側は `fetch('/api/gemini')` で中継APIを呼ぶ。エラーの状態コードはそのまま返し、今のリトライ・モデル切り替えが同じように動くようにする。
- 開発中は Vite の開発サーバーで同じ中継APIが動くようにする（`npm run dev` だけで動く）。
- 悪用を減らす: 使えるモデルを決め打ちにする、本文の大きさに上限、IPごとの簡単な回数制限。
- README・`.env.local` の書き方を合わせる。食い違っている `process.env.API_KEY` の定義を消す。

## 完了条件

- ビルドした `dist/` の中にキーが入っていない。
- 開発サーバーでクイズ生成・くわしい解説が今までどおり動く。
- 公開先（Vercel）での設定手順が [deploy.md](../deploy.md) に書いてある。

## 経過

### 2026-11-21

- 変更前の確認: `npm run build` で作った `dist/assets/*.js` に API キーがそのまま入っていた。
- 中継APIを作成。
  - [server/geminiProxy.ts](../../server/geminiProxy.ts): 要求の確認（モデルは決め打ち、config は3項目だけ通す）・IPごとの回数制限・Gemini 呼び出し・エラーの状態コードの受け渡し。
  - [api/gemini.ts](../../api/gemini.ts): Vercel の関数（`POST /api/gemini`）。本文 4.4MB 上限、`ALLOWED_ORIGINS` でほかのサイトからの呼び出しを断れる。
  - [vite.config.ts](../../vite.config.ts): 開発サーバーの中で同じ中継APIを動かすプラグイン。`process.env.API_KEY` の古い定義は削除。
- 画面側は [services/aiClient.ts](../../services/aiClient.ts) から `fetch('/api/gemini')` で呼ぶ。エラーは `{status, message}` の形で投げるので、今のリトライ・モデル切り替え・枚数を減らす処理はそのまま動く。
- モデル名と、スキーマ用の定数（`Type`・`ThinkingLevel`）を [services/aiModels.ts](../../services/aiModels.ts) に移した。画面側が `@google/genai` を読み込まなくなり、**JS が 500kB 超 → 272kB（gzip 87kB）に減った**。
- [retryPolicy.ts](../../services/retryPolicy.ts): 413（送るデータが大きすぎ）を「画像を減らして再試行」の対象に、ブラウザの通信失敗（`Failed to fetch` / `Load failed`）を再試行の対象に追加。
- サーバー側のコードは Vercel で動くよう import に `.js` を付けて書く。テストでは `scripts/ts-resolve-hook.mjs` で `.ts` に読み替える。
- `.env.local` の変数名を `VITE_GEMINI_API_KEY` → `GEMINI_API_KEY` に変更（値はそのまま）。`services/test-models.js` も合わせた。
- テスト: 中継API 8件・aiClient 7件を追加（合計75件、すべて成功）。`tsc` 成功。
- 確認: ビルド後の `dist/` にキーも SDK も入っていない。開発サーバーの `/api/gemini` から実際に Gemini の返事が返る（「春」→ Spring）。決めたモデル以外は 400 で断る。
- 残り: Vercel に公開して動くかの確認と、環境変数の付け替え・キーの作り直し（[deploy.md](../deploy.md)）。`.env.local` の2行目のコメントに古い変数名が残っているかもしれない（値が入ったファイルなので中身を表示していない）。

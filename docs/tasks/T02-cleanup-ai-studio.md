# T02 AI Studio の名残を片付ける・テストを回せるようにする

- 優先度: 高
- 状態: ✅ 完了

## 背景

- `index.html` に esm.sh から読み込む `importmap` が残っている。バージョンも package.json と違い（react@^19.2.4、vite まで入っている）、Vite がまとめた本体とぶつかる元になる。
- テスト（`services/*.test.ts`、60件）は `node --test` で動くが、`package.json` に `test` がない。
- `user-scalable=no` で拡大できない。
- `metadata.json`（AI Studio 用）、`models.txt`（古いモデル一覧）など使っていないファイルがある。

## やること

- `importmap` を消す。
- `npm test` を足す。
- `user-scalable=no` / `maximum-scale=1.0` を外す。
- 使っていないファイルを整理する（消してよいか確認したうえで）。
- `<title>` を日本語のアプリ名にする。

## 完了条件

- `npm test` と `npm run build` が通る。
- 開発サーバーで画面がこれまでどおり出る。

## 経過

### 2026-11-21

- `index.html` から esm.sh の `importmap` を削除。フォントの `preconnect` を追加し、`<title>` を「AIクイズ — 写真から4択クイズ」に変更。
- `user-scalable=no` / `maximum-scale=1.0` を外し、ノッチ対応のため `viewport-fit=cover` を追加。
- `package.json` に `"test": "node --test \"services/**/*.test.ts\""` を追加。`npm test` で60件すべて成功。
- 使っていない `metadata.json`（AI Studio 用）と `models.txt`（古いモデル一覧）を削除（git から戻せる）。`services/test-models.js` はモデル一覧を調べるのに使えるので残した。
- `npm run build` は成功。500kB を超えるチャンクの警告が出る（recharts などが原因。T05 でグラフを使うときに分割を検討）。
- わかったこと: 今の `dist/` のJSに API キーがそのまま入っている（T01 で対応）。

# 問題の質の評価（T03）

1. `eval/images/` に代表的な教材の写真を置く（10〜20枚。漢字・計算・英語・理科・社会をまんべんなく）。
   写真は著作物・個人の持ち物なので git には入れない（`.gitignore` 済み）。
2. `npm run eval` を実行する（`.env.local` の `GEMINI_API_KEY` を使う）。
3. `eval/results/日時.md` に表ができる。プロンプトを変えた前後で見比べる。

よく使うオプション:

```
npm run eval -- --modes=quiz                       # モードをしぼる（study-sunao,study-amano,quiz）
npm run eval -- --models=gemini-3.5-flash-lite      # モデルをしぼる（カンマ区切り）
npm run eval -- --judge=gemini-3.5-flash            # 採点に使うモデル
npm run eval -- --repeat=2                          # 同じ条件で何回作るか（AIの答えはぶれるため）
```

注意: 1回の実行で「モデル数 × (画像の書き出し + モード数 × (作問 + 採点))」回 API を呼ぶ。

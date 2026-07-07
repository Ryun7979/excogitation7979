# 設計書: 40枚アップロード対応＋賢い出題画像サンプリング

日付: 2026-07-07
対象: AIしゃしんクイズ（ai-quiz-four-choices）

## 目的

画像アップロード上限を現在の20枚から40枚に増やす。ただしAPIへの負荷（トークン消費・生成時間・クォータ）を現状同等に保つため、AIに実際に送信する画像は重み付きサンプリングで最大20枚に絞る。再プレイ時には「前回選ばれなかった画像」「間違えた問題の元になった画像」が優先的に選ばれるようにし、繰り返し遊ぶほど未消化・苦手なページが出やすくなる体験を作る。

## 背景

- 現状は `MAX_IMAGES = 20`（App.tsx）で、全画像を512px幅にリサイズしてbase64化し、1回のGemini API呼び出しで10問生成している。
- 単純に40枚全部を送ると、送信データ量・トークン消費・生成時間が倍増し、429（クォータ超過）が頻発するリスクがある。
- OCR前処理案は検討したが不採用: Gemini Vision呼び出しが2段階になり遅くなる上、図表・写真の視覚情報が失われ「クイズモード」（連想・なぞなぞ）が成立しなくなるため。

## 全体の流れ

1. **アップロード時**（最大40枚）: 画像ごとの統計 `imageStats`（選択回数 `timesSelected`、不正解回数 `wrongCount`）を0で初期化。
2. **クイズ生成時**: 統計をもとに重み付き抽選で最大20枚を選出。選ばれた画像だけをリサイズ（maxWidth 400）してAPIに送信。
3. **AI応答**: 各問題がどの画像を元にしたかを示す `sourceImageIndex`（送信画像内でのインデックス）をレスポンススキーマに追加して返してもらう。
4. **統計更新**: 選ばれた画像は `timesSelected + 1`。不正解だった問題の元画像は `wrongCount + 1`。
5. **「もういちど！」再プレイ**: 同じ画像セット・蓄積済み統計で再サンプリング → 未使用・苦手ページが優先的に選ばれる。

## 変更点詳細

### types.ts
- `QuizQuestion` に `sourceImageIndex?: number` を追加（送信画像内インデックス）。
- 新規インターフェース `ImageStat { timesSelected: number; wrongCount: number }` を追加。
- `GameState` に `imageStats: ImageStat[]` を追加（`images` と同じ長さ・並び）。

### services/geminiService.ts
- `resizeImage` の `maxWidth` デフォルトを 512 → 400 に縮小（40枚時代の安全マージン確保）。
- 重み付きサンプリング関数 `selectImagesForQuiz(files, stats, maxCount)` を追加:
  - 重み = 基礎重み1 ÷ (1 + timesSelected) × (1 + wrongCount) のような「未選択ほど・間違えたページほど重い」計算。
  - 重みに比例した非復元ランダム抽選で最大 `maxCount`（20）枚を選出。
  - 画像が20枚以下なら全画像を選出（抽選不要）。
  - 返り値は元配列内のインデックス配列（昇順ソートし、ページ順を維持）。
- `quizSchema` に `sourceImageIndex`（INTEGER、送信画像の何枚目を元にしたか、0始まり）を追加し、プロンプトにも明記。
- `generateQuizFromImages` の返り値を `{ questions: QuizQuestion[], selectedIndices: number[] }` に変更。`selectedIndices` は元の `images` 配列に対するインデックス。各 question の `sourceImageIndex` は呼び出し側で `selectedIndices` を介して元インデックスに変換して保持する。

### App.tsx
- `MAX_IMAGES` を 40 に変更。
- `handleImageUpload` で `imageStats` を画像数ぶん0初期化。
- `startGeneration`:
  - `generateQuizFromImages` に `imageStats` を渡す。
  - 生成成功後、選ばれた画像の `timesSelected` をインクリメント。
  - 各問題の `sourceImageIndex` を「元の images 配列のインデックス」に正規化して保存。
- `handleAnswer`（または結果確定時）: 不正解だった問題の `sourceImageIndex` に対応する `wrongCount` をインクリメント。
- `backToTitle`: `imageStats` もリセット。
- タイトル画面: 「MAX 40」表記の更新と、多枚数選択時（例: 21枚以上）に「たくさん選ぶと少し時間がかかるよ」の案内文を表示。

## エラーハンドリング・割り切り

- AIが返す `sourceImageIndex` はLLMの自己申告であり正確性は保証されない。クイズの正誤判定には一切使わず、重み付けのヒントとしてのみ使用する。
- `sourceImageIndex` が欠落・範囲外の場合は単に `wrongCount` 更新をスキップする（動作は壊れない）。
- 既存のフォールバックモデル・429リトライ・リクエストキューの仕組みは変更しない。

## テスト方針

テストフレームワーク未導入のプロジェクトのため、手動確認で検証する:
1. 40枚アップロードできること、41枚でエラーモーダルが出ること。
2. 21枚以上アップロード時に生成が現状と同等の時間で完了すること。
3. 「もういちど！」で再生成した際、前回と異なる画像群が選ばれる傾向があること（コンソールログで選出インデックスを確認）。
4. 間違えた問題の元画像が次回選ばれやすくなること。
5. 20枚以下の場合は従来どおり全画像が使われること。

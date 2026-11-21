# T07 大きいファイルを分ける

- 優先度: 低
- 状態: ✅ 完了

## 背景

`App.tsx`（695行）と `services/geminiService.ts`（776行）が大きく、手直ししにくい。

## やること

- `App.tsx` を画面ごとに分ける（`screens/TitleScreen.tsx`・`PlayingScreen.tsx`・`FeedbackScreen.tsx`・`SummaryScreen.tsx`・`GeneratingScreen.tsx`）。
- `geminiService.ts` から、プロンプト（`services/prompts.ts`）・画像の縮小（`services/imageResize.ts`）・励ましの言葉（`services/advicePool.ts`）を分ける。
- 動きは変えない（見た目の変更は T09〜T11 で行う）。

## 完了条件

- `npm test` と `npm run build` が通り、画面の動きが変わらない。

## 経過

### 2026-11-21

- `geminiService.ts`（776行 → 359行）から次を分けた。プロンプトの文面は変えていない。
  - [services/quizPrompts.ts](../../services/quizPrompts.ts): 応答の形（responseSchema）・作問の指示文・画像の書き出しの指示文・くわしい解説の指示文。T03 の評価スクリプトからも使う。
  - [services/imageResize.ts](../../services/imageResize.ts): 送る前の画像の縮小。
  - [services/advicePool.ts](../../services/advicePool.ts): 結果画面の励ましの言葉。
  - [services/aiModels.ts](../../services/aiModels.ts)（T01 で作成）: モデル名とスキーマ用の定数。
- `App.tsx`（695行 → 約400行）は状態と処理だけにし、画面を [screens/](../../screens/) に分けた（Title・Generating・Playing・Feedback・Summary・History）。
  - 画面の見た目も T09〜T11 で作り直すので、分けるのと作り直しを同時に行った。「動きを変えない分割」だけを先にやると、同じ画面を2回書き直すことになるため。
- 共通部品として [components/Dialog.tsx](../../components/Dialog.tsx)（ダイアログ）と [components/RichText.tsx](../../components/RichText.tsx)（AIの文の太字を表示）を追加。3か所でばらばらに書いていたダイアログを1つにまとめた。
- `npm test`（87件）・`npm run build` とも成功。

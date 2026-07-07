# 50枚アップロード対応＋重み付き画像サンプリング 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画像アップロード上限を50枚に拡大しつつ、AIへは重み付き抽選で選んだ最大20枚だけを送信し、再プレイ時に未使用・苦手・内容の濃いページが出やすくなるようにする。

**Architecture:** `imageStats`（選択回数・不正解回数・生成問題数）を `GameState` に持たせ、`geminiService.ts` の重み付きサンプリング関数で送信画像を選出する。AIには各問題の元画像インデックス（`sourceImageIndex`）を返させ、統計更新に使う。重み式は「(1 + wrongCount + 収穫率) ÷ (1 + 0.5 × timesSelected)」でベース1を保証し、どのページも選ばれ続ける。

**Tech Stack:** React 19 + TypeScript + Vite、@google/genai（Gemini API、structured output）

**設計書:** `docs/superpowers/specs/2026-07-07-50-images-weighted-sampling-design.md`

**検証方針:** テストフレームワーク未導入のプロジェクトのため、各タスクで `npm run build`（tsc型チェック＋viteビルド）を通し、最後に手動確認を行う。

---

### Task 1: 型定義の追加（types.ts）

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: `QuizQuestion` に `sourceImageIndex` を追加**

`types.ts` の `QuizQuestion` インターフェースに1行追加する:

```ts
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[]; // Always 4 options
  correctAnswerIndex: number; // 0-3
  explanation: string; // The "point" of the question
  targetAge?: string; // Estimated target age/grade (e.g., "小学1年生", "中学生")
  detailedExplanation?: string; // Cached detailed explanation to avoid re-fetching
  sourceImageIndex?: number; // この問題の元になった画像（元のimages配列に対するインデックス）
}
```

- [ ] **Step 2: `ImageStat` インターフェースを新規追加**

`QuizQuestion` の直前に追加する:

```ts
export interface ImageStat {
  timesSelected: number;  // クイズ生成でAIに送信された回数
  wrongCount: number;     // この画像から出た問題で間違えた回数
  questionCount: number;  // この画像から作られた問題の累計数
}
```

- [ ] **Step 3: `GameState` に `imageStats` を追加**

```ts
export interface GameState {
  stage: AppStage;
  mode: GameMode;
  teacher: TeacherType; // Selected teacher personality
  images: File[];
  imageStats: ImageStat[]; // imagesと同じ長さ・並びの統計情報
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  results: QuizResult[];
  advice?: string; // AI generated advice
  errorMessage?: string;
  loadingMessage?: string; // Message to show during loading states
}
```

- [ ] **Step 4: App.tsx の GameState 初期化2箇所に `imageStats: []` を追加**

`App.tsx` の `useState` 初期値（13〜22行付近）と `backToTitle`（60〜71行付近）の両方に `imageStats: [],` を追加する（追加しないと tsc が通らないため本タスクに含める）:

```ts
  const [gameState, setGameState] = useState<GameState>({
    stage: AppStage.TITLE,
    mode: GameMode.STUDY,
    teacher: TeacherType.SUNAO,
    images: [],
    imageStats: [],
    questions: [],
    currentQuestionIndex: 0,
    results: [],
  });
```

```ts
  const backToTitle = () => {
    setGameState({
      stage: AppStage.TITLE,
      mode: GameMode.STUDY,
      teacher: TeacherType.SUNAO,
      images: [],
      imageStats: [],
      questions: [],
      currentQuestionIndex: 0,
      results: [],
    });
    setSelectedAnswer(null);
  };
```

- [ ] **Step 5: ビルドで型チェック**

Run: `npm run build`
Expected: エラーなく完了（`dist/` が生成される）

- [ ] **Step 6: Commit**

```bash
git add types.ts App.tsx
git commit -m "feat: 画像統計(ImageStat)とsourceImageIndexの型を追加"
```

---

### Task 2: 重み付きサンプリング関数とリサイズ縮小（geminiService.ts）

**Files:**
- Modify: `services/geminiService.ts`

- [ ] **Step 1: import に `ImageStat` を追加**

```ts
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, TeacherType, ImageStat } from "../types";
```

- [ ] **Step 2: `resizeImage` の maxWidth を 512 → 400 に変更**

```ts
const resizeImage = async (file: File, maxWidth = 400): Promise<string> => {
```

- [ ] **Step 3: 重み付きサンプリング関数を追加**

`resizeImage` の直後（`// --- API Throttle & Queue Logic ---` の前）に追加する:

```ts
// --- Weighted Image Sampling ---
// 1リクエストでAIに送る画像の上限
const MAX_IMAGES_PER_REQUEST = 20;
// 選択回数による重み減衰の強さ（大きいほど既出ページが選ばれにくくなる）
const SELECTION_DECAY = 0.5;

/**
 * 画像統計をもとに重み付き非復元抽選で送信画像を選ぶ。
 * 重み = (1 + wrongCount + 収穫率) ÷ (1 + SELECTION_DECAY × timesSelected)
 * ベース1が常に残るため、どのページも選ばれる可能性を持ち続ける。
 * @returns 元配列に対するインデックスの昇順配列
 */
export const selectImagesForQuiz = (
  stats: ImageStat[],
  maxCount: number = MAX_IMAGES_PER_REQUEST
): number[] => {
  if (stats.length <= maxCount) {
    return stats.map((_, i) => i);
  }

  const weights = stats.map(s => {
    const yieldRate = s.questionCount / Math.max(1, s.timesSelected);
    return (1 + s.wrongCount + yieldRate) / (1 + SELECTION_DECAY * s.timesSelected);
  });

  const candidates = stats.map((_, i) => i);
  const selected: number[] = [];
  while (selected.length < maxCount && candidates.length > 0) {
    const total = candidates.reduce((sum, idx) => sum + weights[idx], 0);
    let r = Math.random() * total;
    let pickPos = candidates.length - 1;
    for (let p = 0; p < candidates.length; p++) {
      r -= weights[candidates[p]];
      if (r <= 0) {
        pickPos = p;
        break;
      }
    }
    selected.push(candidates[pickPos]);
    candidates.splice(pickPos, 1);
  }
  return selected.sort((a, b) => a - b);
};
```

- [ ] **Step 4: ビルドで型チェック**

Run: `npm run build`
Expected: エラーなく完了

- [ ] **Step 5: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: 重み付き画像サンプリング関数を追加、リサイズ幅を400pxに縮小"
```

---

### Task 3: クイズ生成のサンプリング組み込みとsourceImageIndex対応（geminiService.ts + App.tsx）

サービスの返り値型が変わるため、呼び出し側の App.tsx も同一タスクで更新してビルドを保つ。

**Files:**
- Modify: `services/geminiService.ts:183-276`（quizSchema と generateQuizFromImages）
- Modify: `App.tsx:73-110`（startGeneration と handleAnswer）

- [ ] **Step 1: `quizSchema` に `sourceImageIndex` を追加**

```ts
const quizSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING, description: "クイズの問題文" },
      options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4つの選択肢（必ず4つ）" },
      correctAnswerIndex: { type: Type.INTEGER, description: "正解のインデックス(0-3)" },
      explanation: { type: Type.STRING, description: "解説文（100文字程度）" },
      targetAge: { type: Type.STRING, description: "推定対象学年" },
      sourceImageIndex: { type: Type.INTEGER, description: "この問題の元になった画像の番号（送信された画像の0始まりインデックス）" },
    },
    required: ["question", "options", "correctAnswerIndex", "explanation", "targetAge", "sourceImageIndex"],
  },
};
```

- [ ] **Step 2: `generateQuizFromImages` にサンプリングを組み込み、返り値を変更**

シグネチャを変更し、`stats` を受け取って選出画像だけを送信する。プロンプトの共通ルールに sourceImageIndex の指示を追加する:

```ts
export interface QuizGenerationResult {
  questions: QuizQuestion[];
  selectedIndices: number[]; // 元のimages配列に対するインデックス
}

export const generateQuizFromImages = async (
  files: File[],
  stats: ImageStat[],
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void
): Promise<QuizGenerationResult> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

  const selectedIndices = selectImagesForQuiz(stats);
  console.log("Selected image indices for quiz:", selectedIndices);
  const selectedFiles = selectedIndices.map(i => files[i]);

  onProgress("画像を解析して遊び方を考えています...");
  const imageParts = await Promise.all(selectedFiles.map(async (file) => {
    const base64 = await resizeImage(file);
    return { inlineData: { data: base64, mimeType: "image/jpeg" } };
  }));
```

（`teacherStyle`・`modeInstructions` は変更なし。）

`prompt` の共通ルールに4項目目を追加:

```ts
  const prompt = `提供された画像の解析結果をもとに、4択クイズを${TOTAL_QUESTIONS}問、JSON形式で作成してください。
共通ルール：
1. 【画像参照の禁止】: 独立したクイズとして成立させてください。
2. 【言語】: 子供向けの楽しい日本語を使用。
3. 【先生スタイル】: ${teacherStyle}性格で出題。
4. 【元画像の明示】: 各問題について、その問題の元になった画像の番号（送信順で0始まり）をsourceImageIndexとして必ず含めてください。
モード別指示:
${modeInstructions}`;
```

`return` 部分は、questions と selectedIndices を一緒に返す形に変更する:

```ts
  return queuedRequest(async () => {
    onProgress("AIがワクワクする問題を作成中...");

    let lastError: any;
    for (const modelName of FALLBACK_MODELS) {
      try {
        console.log(`Trying model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [...imageParts, { text: prompt }] },
          config: {
            responseMimeType: "application/json",
            responseSchema: quizSchema,
          },
        });

        const text = response.text || "[]";
        const data = JSON.parse(text);
        const questions = data.map((q: any, i: number) => ({
          ...q,
          id: `q-${i}-${Date.now()}`
        }));
        return { questions, selectedIndices };
      } catch (e: any) {
        lastError = e;
        if (e?.status === 429 || e?.message?.includes('429')) {
          console.warn(`Quota exceeded for ${modelName}, trying next fallback...`);
          continue;
        }
        break; // 429以外は即座にエラーとする（JSONパースエラーなど）
      }
    }
    throw lastError || new Error("AIの応答を処理できませんでした。");
  });
};
```

- [ ] **Step 3: App.tsx の `handleImageUpload` で統計を初期化**

```ts
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files as FileList);
      if (files.length > MAX_IMAGES) {
        showModal('枚数制限', `一度に${MAX_IMAGES}枚までだよ！`, 'error');
        return;
      }
      setGameState(prev => ({
        ...prev,
        images: files,
        imageStats: files.map(() => ({ timesSelected: 0, wrongCount: 0, questionCount: 0 })),
      }));
    }
  };
```

- [ ] **Step 4: App.tsx の `startGeneration` を新しい返り値に対応させ、統計を更新**

`sourceImageIndex` を送信内インデックスから元の `images` 配列のインデックスに正規化し、`timesSelected` と `questionCount` を更新する:

```ts
  const startGeneration = async () => {
    if (gameState.images.length === 0) return;
    setGameState(prev => ({ ...prev, stage: AppStage.GENERATING, loadingMessage: "準備中..." }));
    try {
      const { questions, selectedIndices } = await generateQuizFromImages(
        gameState.images,
        gameState.imageStats,
        gameState.mode,
        gameState.teacher,
        (msg) => setGameState(prev => ({ ...prev, loadingMessage: msg }))
      );

      // sourceImageIndexを「元のimages配列のインデックス」に正規化
      const normalizedQuestions = questions.map(q => {
        const raw = q.sourceImageIndex;
        const isValid = typeof raw === 'number' && raw >= 0 && raw < selectedIndices.length;
        return { ...q, sourceImageIndex: isValid ? selectedIndices[raw] : undefined };
      });

      setGameState(prev => {
        const newStats = prev.imageStats.map((s, i) =>
          selectedIndices.includes(i) ? { ...s, timesSelected: s.timesSelected + 1 } : s
        );
        normalizedQuestions.forEach(q => {
          if (q.sourceImageIndex !== undefined && newStats[q.sourceImageIndex]) {
            newStats[q.sourceImageIndex] = {
              ...newStats[q.sourceImageIndex],
              questionCount: newStats[q.sourceImageIndex].questionCount + 1,
            };
          }
        });
        return {
          ...prev,
          imageStats: newStats,
          questions: normalizedQuestions,
          stage: AppStage.PLAYING,
          currentQuestionIndex: 0,
          results: [],
        };
      });
      setStartTime(Date.now());
    } catch (error: any) {
      console.error(error);
      setGameState(prev => ({ ...prev, stage: AppStage.TITLE }));
      showModal('エラー', "クイズを作れませんでした。画像をかえて試してみてね。", 'error');
    }
  };
```

- [ ] **Step 5: App.tsx の `handleAnswer` で不正解時に `wrongCount` を更新**

```ts
  const handleAnswer = (optionIndex: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(optionIndex);
    const timeTaken = (Date.now() - startTime) / 1000;
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
    const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;
    const newResult: QuizResult = {
      questionIndex: gameState.currentQuestionIndex,
      isCorrect,
      timeTakenSeconds: timeTaken,
    };

    setTimeout(() => {
      setGameState(prev => {
        const srcIdx = currentQuestion.sourceImageIndex;
        const newStats = (!isCorrect && srcIdx !== undefined && prev.imageStats[srcIdx])
          ? prev.imageStats.map((s, i) => i === srcIdx ? { ...s, wrongCount: s.wrongCount + 1 } : s)
          : prev.imageStats;
        return {
          ...prev,
          stage: AppStage.FEEDBACK,
          imageStats: newStats,
          results: [...prev.results, newResult],
        };
      });
    }, 600);
  };
```

- [ ] **Step 6: ビルドで型チェック**

Run: `npm run build`
Expected: エラーなく完了

- [ ] **Step 7: Commit**

```bash
git add services/geminiService.ts App.tsx
git commit -m "feat: 重み付きサンプリングをクイズ生成に組み込み、画像統計の更新を実装"
```

---

### Task 4: 上限50枚化とUI文言（App.tsx）

**Files:**
- Modify: `App.tsx:11`（MAX_IMAGES）
- Modify: `App.tsx:243-245`（画像セット完了バー）

- [ ] **Step 1: `MAX_IMAGES` を 50 に変更**

```ts
const MAX_IMAGES = 50;
```

（タイトル画面の「MAX {MAX_IMAGES}」表記は定数参照のため自動で「MAX 50」になる。）

- [ ] **Step 2: 21枚以上選択時の注意文を追加**

`renderTitle` 内の「枚セット完了」バー（`bg-sky-500 p-3 lg:p-5 ...` の div）を以下に置き換える:

```tsx
              <div className="bg-sky-500 p-3 lg:p-5 text-center border-t-4 lg:border-t-8 border-sky-600 shadow-lg shrink-0 flex flex-col items-center justify-center gap-1">
                <span className="text-white font-black text-base md:text-lg lg:text-3xl">{gameState.images.length} 枚セット完了！（タップで変更）</span>
                {gameState.images.length > 20 && (
                  <span className="text-white/90 font-bold text-xs lg:text-base">たくさん選ぶと、だいじなページの問題が出にくくなるよ</span>
                )}
              </div>
```

- [ ] **Step 3: ビルドで型チェック**

Run: `npm run build`
Expected: エラーなく完了

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: アップロード上限を50枚に拡大し、多枚数時の注意文を追加"
```

---

### Task 5: 手動確認

**Files:** なし（動作確認のみ）

- [ ] **Step 1: 開発サーバーを起動**

Run: `npm run dev`
Expected: `http://localhost:5173` で起動

- [ ] **Step 2: 枚数制限の確認**

- 50枚アップロード → 受け付けられ「50 枚セット完了！」と注意文が表示される
- 51枚アップロード → 「一度に50枚までだよ！」エラーモーダル
- 20枚以下 → 注意文が表示されない

- [ ] **Step 3: サンプリングの確認（21枚以上で実施）**

- 「はじめる!」→ ブラウザコンソールに `Selected image indices for quiz: [...]`（最大20個）が出ること
- 生成時間が従来（20枚時代）と同等であること

- [ ] **Step 4: 統計と再プレイの確認**

- クイズ中にいくつか意図的に間違える
- サマリー画面で「もういちど！」→ コンソールの選出インデックスが前回と変化し、間違えた問題のページが含まれやすいこと（確率的なので数回試行）
- 20枚以下のセットでは毎回全画像が選ばれること（インデックスが `[0..n-1]` 全部）

- [ ] **Step 5: 既存機能の回帰確認**

- べんきょう/クイズ両モードで10問プレイが完走できる
- 不正解時の「くわしい解説を見る！」が動作する
- サマリーのアドバイスが表示される

- [ ] **Step 6: 問題があれば修正してコミット、なければ完了**

```bash
git status  # 作業ツリーがクリーンであることを確認
```

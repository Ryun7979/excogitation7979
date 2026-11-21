/// <reference types="vite/client" />

import { ThinkingLevel, FALLBACK_MODELS } from "./aiModels";
import { generateContent } from "./aiClient";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, TeacherType, ImageStat } from "../types";
import { IMAGE_MAX_SIZE, resizeImage } from "./imageResize";
import { GENERATION_COUNT, buildQuizSchema, analysisSchema, buildAnalysisPrompt, buildQuizPrompt, buildDetailedExplanationPrompt } from "./quizPrompts";
export { generateAdvice } from "./advicePool";
import { isRetryableApiError, isSlowdownError, RetryableError, describeApiError } from "./retryPolicy";
import { IMAGE_BATCH_LEVELS, stepDown, stepUp, initialBatchSize } from "./batchSizer";
import { getCachedAnalysis, setCachedAnalysis } from "./imageAnalysisCache";
import { sanitizeQuestions, shuffleOptions } from "./quizValidation";

// Gemini は中継API（/api/gemini）経由で呼ぶ。APIキーは画面側に置かない（server/geminiProxy.ts）。
// ハングした要求はタイムアウトで切って次のフォールバックモデルに回す（aiClient.ts）。
// 混雑時のリトライは withModelFallback（自前）で行う。

// --- Weighted Image Sampling ---
// 1リクエストでAIに送る画像の上限（混雑時は段階的に減らす）
const MAX_IMAGES_PER_REQUEST = IMAGE_BATCH_LEVELS[0];
// 選択回数による重み減衰の強さ（大きいほど既出ページが選ばれにくくなる）
const SELECTION_DECAY = 0.5;

/**
 * 画像統計をもとに重み付き非復元抽選で送信画像を選ぶ。
 * 重み = (1 + wrongCount + 収穫率) ÷ (1 + SELECTION_DECAY × timesSelected)
 * ベース1が常に残るため、どのページも選ばれる可能性を持ち続ける。
 * @returns 抽選順のインデックス配列（先頭ほど優先度が高い）。
 *          混雑時に先頭N枚へ切り詰めても重み付き抽選として成立する
 */
export const selectImagesForQuiz = (
  stats: ImageStat[],
  maxCount: number = MAX_IMAGES_PER_REQUEST
): number[] => {
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
  return selected;
};

// --- API Throttle & Queue Logic ---
const MIN_REQUEST_INTERVAL = 2000; // 安全のため2秒に調整
let requestQueue = Promise.resolve();
let lastRequestTime = 0;
let isBusy = false;

async function queuedRequest<T>(operation: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    const now = Date.now();
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL - (now - lastRequestTime));
    if (waitTime > 0) await sleep(waitTime);

    isBusy = true;
    try {
      lastRequestTime = Date.now();
      const res = await operation();
      return res;
    } finally {
      isBusy = false;
    }
  });

  requestQueue = result.then(() => { }).catch(() => { });
  return result;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// クイズ作りで使うモデル。gemini-2.5-flash-lite は外す（2026-11）。
// 混雑時の代わりにこれが使われると、「春」の英語を winter にする・こどもの日の由来を
// まちがえるなど、ほかのモデルより明らかに問題が崩れたため。詳しい解説には引き続き全モデルを使う
const QUIZ_MODELS: readonly string[] = FALLBACK_MODELS.filter(m => m !== 'gemini-2.5-flash-lite');

// 思考(thinking)は応答を大幅に遅くするため最小にする。指定方法は世代で異なり、
// 間違えると400エラー（リトライ対象外）で即失敗するので注意:
// - 3系: thinkingBudget:0 は400になる → thinkingLevel を最小(MINIMAL)に
// - 2.5系: thinkingBudget:0 で無効化
const buildModelConfig = (modelName: string) =>
  /gemini-3/.test(modelName)
    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
    : { thinkingConfig: { thinkingBudget: 0 } };

// 直近の成功/失敗から学習した「一度に送る画像枚数」（セッション中は維持）
let adaptiveMaxImages = IMAGE_BATCH_LEVELS[0];

// これより速く成功したら、次回は枚数を1段戻す
const FAST_RESPONSE_MS = 20000;

// 混雑(503)等の一時的エラー時、モデルを替えながら最大2周まで再試行する
const MAX_FALLBACK_ROUNDS = 2;
const ROUND_BACKOFF_MS = 3000;

async function withModelFallback<T>(
  run: (modelName: string) => Promise<T>,
  onRetry?: (modelName: string, e: unknown) => void,
  models: readonly string[] = FALLBACK_MODELS
): Promise<T> {
  let lastError: unknown;
  for (let round = 0; round < MAX_FALLBACK_ROUNDS; round++) {
    if (round > 0) await sleep(ROUND_BACKOFF_MS * round);
    for (const modelName of models) {
      try {
        return await run(modelName);
      } catch (e) {
        lastError = e;
        // APIキー無効・不正リクエストなどはモデルを替えても無駄なので即エラー
        if (!isRetryableApiError(e)) throw e;
        console.warn(`${modelName} failed (${(e as any)?.message ?? e}), trying next fallback...`);
        onRetry?.(modelName, e);
      }
    }
  }
  throw lastError ?? new Error("AIの応答を処理できませんでした。");
}

export interface QuizGenerationResult {
  questions: QuizQuestion[];
  selectedIndices: number[]; // 元のimages配列に対するインデックス
}

// --- 2フェーズ生成（隠し機能・デフォルトON） ---
// フェーズ1: 画像→テキスト要約（重い・画像込み）。File参照でキャッシュし、
//   同じ画像は二度と解析しない。モデル切替リトライ・枚数を減らした再試行・
//   「もういちど」再プレイのすべてでこのキャッシュが再利用される。
// フェーズ2: テキスト要約→クイズ（軽い・画像なし）。失敗しても画像を送り直さず再試行できる。
// ゲームは常に TOTAL_QUESTIONS 問ある前提で進むため、足りない・形が壊れた応答は
// 再試行対象にする（そのまま使うと途中で問題が無くなり画面が落ちる）
const parseQuizResponse = (text: string | undefined): QuizQuestion[] => {
  const questions = sanitizeQuestions(JSON.parse(text || "[]"), TOTAL_QUESTIONS);
  if (questions.length < TOTAL_QUESTIONS) {
    throw new RetryableError(`AIの問題が足りませんでした（${questions.length}/${TOTAL_QUESTIONS}問）`);
  }
  const now = Date.now();
  return questions.map((q, i) => {
    // 作問メモ（あまの先生の originalContent 等、クイズモードの quizStyle 等）はゲームには不要なので取り除く
    const { originalContent, learningTheme, twist, quizStyle, hook, basis, questionForm, asks, solution, answer, ...rest } = q as any;
    if (twist) console.log(`[作問メモ] 元: ${originalContent} / テーマ: ${learningTheme} / 変更: ${twist}`);
    if (quizStyle) console.log(`[作問メモ] 問${i + 1} スタイル: ${quizStyle} / ポイント: ${hook} / 根拠: ${basis}`);
    // AIは正解を前の方に置きがちなので、選択肢の並びをシャッフルする
    return { ...shuffleOptions(rest as QuizQuestion), id: `q-${i}-${now}` };
  });
};

async function generateQuizSinglePhase(
  attemptIndices: number[],
  getResizedBase64: (fileIndex: number, maxSize?: number) => Promise<string>,
  prompt: string,
  quizSchema: object,
  modelName: string,
): Promise<QuizQuestion[]> {
  const imageParts = await Promise.all(attemptIndices.map(async i => ({
    inlineData: { data: await getResizedBase64(i, IMAGE_MAX_SIZE), mimeType: "image/jpeg" }
  })));
  const response = await generateContent({
    model: modelName,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: quizSchema,
      ...buildModelConfig(modelName),
    },
  });
  return parseQuizResponse(response.text);
}

async function generateQuizTwoPhase(
  files: File[],
  attemptIndices: number[],
  getResizedBase64: (fileIndex: number, maxSize?: number) => Promise<string>,
  prompt: string,
  quizSchema: object,
  modelName: string,
  onProgress: (message: string) => void,
): Promise<QuizQuestion[]> {
  const uncached = attemptIndices.filter(i => !getCachedAnalysis(files[i]));

  if (uncached.length > 0) {
    onProgress(
      uncached.length === attemptIndices.length
        ? "画像を解析しています..."
        : `新しい画像だけ解析しています...(${uncached.length}枚)`
    );
    console.log(`Analyzing ${uncached.length}/${attemptIndices.length} images (rest reused from cache)`);
    const imageParts = await Promise.all(uncached.map(async i => ({
      inlineData: { data: await getResizedBase64(i, IMAGE_MAX_SIZE), mimeType: "image/jpeg" }
    })));
    const response = await generateContent({
      model: modelName,
      contents: { parts: [...imageParts, { text: buildAnalysisPrompt(uncached.length) }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        ...buildModelConfig(modelName),
      },
    });
    const data = JSON.parse(response.text || "[]");
    if (!Array.isArray(data) || data.length !== uncached.length) {
      throw new RetryableError("画像解析の応答が不正でした");
    }
    uncached.forEach((fileIndex, pos) => {
      const summary = data[pos]?.summary;
      const materialType = data[pos]?.materialType;
      if (typeof summary === 'string' && summary.trim()) {
        const typeLine = typeof materialType === 'string' && materialType.trim()
          ? `教材の種類: ${materialType.trim()}\n`
          : '';
        setCachedAnalysis(files[fileIndex], `${typeLine}${summary.trim()}`);
      }
    });
    if (uncached.some(i => !getCachedAnalysis(files[i]))) {
      throw new RetryableError("画像解析結果が一部欠けていました");
    }
  } else {
    console.log("All images already analyzed — reusing cached data, skipping image analysis");
    onProgress("前回のデータを使って問題を作成中...");
  }

  onProgress("AIがワクワクする問題を作成中...");
  const analysisBlock = attemptIndices
    // 見出しを「画像N」にすると「画像の何番？」型の問題を誘発するため「元ネタN」にする
    .map((fileIndex, pos) => `[元ネタ${pos}]\n${getCachedAnalysis(files[fileIndex])}`)
    .join('\n\n');
  // 解析結果は「元ネタ」。指示の後ろに置き、指示より先に読ませて丸写しを誘発しないようにする
  const contents = `${prompt}\n\n===== 画像の解析結果（元ネタ） =====\n${analysisBlock}\n===== ここまで =====\n\n上の指示に従って${GENERATION_COUNT}問を作成してください。`;
  const response = await generateContent({
    model: modelName,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: quizSchema,
      ...buildModelConfig(modelName),
    },
  });
  return parseQuizResponse(response.text);
}

export const generateQuizFromImages = async (
  files: File[],
  stats: ImageStat[],
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void,
  useFastRetry: boolean = true
): Promise<QuizGenerationResult> => {
  const prompt = buildQuizPrompt(mode, teacher);
  const quizSchema = buildQuizSchema(mode, teacher);

  // 抽選順（優先度順）で受け取り、送信時に先頭N枚だけ使う（Nは混雑状況で増減）
  const drawnIndices = selectImagesForQuiz(stats);
  console.log("Selected image indices for quiz:", drawnIndices, "fastRetry:", useFastRetry);

  // 画像リサイズは実際に送信が必要になった時点で行う（解析済みキャッシュがあれば不要）
  const resizedCache = new Map<string, string>();
  const getResizedBase64 = async (
    fileIndex: number,
    maxSize: number = IMAGE_MAX_SIZE
  ): Promise<string> => {
    const key = `${fileIndex}@${maxSize}`;
    let base64 = resizedCache.get(key);
    if (!base64) {
      base64 = await resizeImage(files[fileIndex], maxSize);
      resizedCache.set(key, base64);
    }
    return base64;
  };

  return queuedRequest(async () => {
    onProgress("画像を解析して遊び方を考えています...");

    let sendCount = initialBatchSize(adaptiveMaxImages, drawnIndices.length);

    return withModelFallback(
      async (modelName) => {
        // 抽選順の先頭 sendCount 枚を、ページ順に並べ替えて送信する
        const picked = drawnIndices
          .map((imageIndex, drawPos) => ({ imageIndex, drawPos }))
          .slice(0, sendCount)
          .sort((a, b) => a.imageIndex - b.imageIndex);
        const attemptIndices = picked.map(p => p.imageIndex);

        console.log(`Trying model: ${modelName} (images: ${attemptIndices.length})`);
        const startedAt = Date.now();

        const questions = useFastRetry
          ? await generateQuizTwoPhase(files, attemptIndices, getResizedBase64, prompt, quizSchema, modelName, onProgress)
          : await generateQuizSinglePhase(attemptIndices, getResizedBase64, prompt, quizSchema, modelName);

        // 速く成功したら次回は1段戻し、遅かったら今回の枚数を維持する
        adaptiveMaxImages = (Date.now() - startedAt < FAST_RESPONSE_MS)
          ? stepUp(sendCount)
          : sendCount;

        return { questions, selectedIndices: attemptIndices };
      },
      (_modelName, e) => {
        // タイムアウト・過負荷なら送信枚数を1段減らして軽くする（最低5枚）
        const reduced = stepDown(sendCount);
        if (isSlowdownError(e) && reduced < sendCount) {
          sendCount = reduced;
          adaptiveMaxImages = reduced;
          onProgress(`画像を${reduced}枚にへらして再挑戦中...`);
        } else {
          onProgress("AIがこみあっています。別ルートで再挑戦中...");
        }
      },
      QUIZ_MODELS
    );
  });
};

/**
 * 特定の問題に対する詳細な解説を生成する
 */
export const generateDetailedExplanation = async (question: QuizQuestion, teacher: TeacherType): Promise<string> => {
  const prompt = buildDetailedExplanationPrompt(question, teacher);

  return queuedRequest(async () => {
    try {
      return await withModelFallback(async (modelName) => {
        const response = await generateContent({
          model: modelName,
          contents: prompt,
          config: buildModelConfig(modelName),
        });
        return response.text?.trim() || "解説の生成に失敗しました。もう一度試してみてね。";
      });
    } catch (e) {
      return `解説の生成に失敗しました。少し待ってからもう一度試してみてね。\n\n【原因】${describeApiError(e)}`;
    }
  });
};

export const getApiStatus = () => {
  if (isBusy) {
    return { status: 'busy' as const, label: 'AI思考中...' };
  }
  return { status: 'ok' as const, label: 'AI準備完了' };
};

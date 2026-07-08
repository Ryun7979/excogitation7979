/// <reference types="vite/client" />

import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, TeacherType, ImageStat } from "../types";
import { isRetryableApiError, isSlowdownError, RetryableError, describeApiError } from "./retryPolicy";
import { IMAGE_BATCH_LEVELS, stepDown, stepUp, initialBatchSize } from "./batchSizer";

// ハングした要求はタイムアウトで切って次のフォールバックモデルに回す。
// 注意: SDKのretryOptionsは使わない — 有効にするとエラーがAbortErrorに
// 包み直されて元のステータス・メッセージが失われ、原因表示ができなくなる。
// 混雑時のリトライは withModelFallback（自前）で行う。
const AI_HTTP_OPTIONS = {
  timeout: 45000,
};

const createAiClient = () => new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  httpOptions: AI_HTTP_OPTIONS,
});

// --- Static Advice Database (Pre-generated) ---
const ADVICE_POOL: Record<number, string[]> = {
  0: [
    "伸び代しかない！次こそリベンジだ",
    "ここからがスタート。一緒に頑張ろう",
    "焦らず一歩ずつ、次は正解できるよ",
    "挑戦した君は偉い！次は1問目指そう",
    "失敗は成功の母。次はもっといける",
    "大丈夫、君の冒険は始まったばかり",
    "次は君の本当の力が見れるはずだ",
    "この悔しさをバネに、次は大逆転だ！"
  ],
  1: [
    "最初の一歩、お見事！次は2点だ",
    "1問正解！ここから積み上げよう",
    "ナイス1点！次はもっといけるはず",
    "まずは1問突破。君の才能、感じたよ",
    "基礎を固めて、次は倍の正解を狙おう",
    "いいぞ！次はもっと正解が増えるはず",
    "まずは1勝！君ならもっとできる",
    "1点の輝き！次へのヒントが見えたね"
  ],
  2: [
    "2問正解！進歩してる、その調子",
    "少しずつ分かってきたね、次も期待",
    "次は半分を目指して、復習してみよう",
    "ナイスチャレンジ！君の力はこれから",
    "復習すれば、次はきっと倍いける！",
    "君のひらめき、少しずつ形になってる",
    "一歩ずつ確実に。次はもっと上へ！",
    "いい調子だね、次は4問目指そう！"
  ],
  3: [
    "3問正解！基礎はバッチリだね",
    "いいリズムだよ！次は4問目指そう",
    "粘り強さが素晴らしい。次はもっと！",
    "君の努力は無駄じゃない。次は半分だ",
    "半分まであと少し！次は超えられる",
    "君の集中力、本物だね。次はもっと！",
    "3点の壁を越えて、次はもっと高みへ",
    "ナイスファイト！次は合格点だ！"
  ],
  4: [
    "4問正解！あと1問で半分、惜しい！",
    "いいセンスしてるね、次は勝ち越そう",
    "着実に力がついてる。次は5問だ",
    "半分まであと一歩。君ならいける！",
    "もう少しで覚醒だ！次こそは5点！",
    "君の解答、光るものがあったよ。次！",
    "ナイス！あと少しで勝てる、頑張ろう",
    "次はきっと半分以上、正解できるよ"
  ],
  5: [
    "半分正解！ナイス！安定してるね",
    "次は勝ち越そう！君なら絶対いける",
    "ちょうど5割！いいバランスの解答だ",
    "さらに高みを目指して、次も挑戦だ！",
    "君の力は本物だ。次は6問目指そう",
    "ハーフタイム終了、次はもっと上へ",
    "ナイス！ここから正解を積み上げよう",
    "5点突破！君の才能が花開いてる"
  ],
  6: [
    "6問正解！勝ち越しだ、お見事！",
    "よく頑張ったね！安定した実力だ",
    "さらに磨きをかけて、次は7点だ！",
    "君の知識は本物。次はもっといける",
    "いい波に乗ってるよ。次は8点狙い",
    "ナイス正解率！自信を持って次へ",
    "勝ち越し成功！君はもっと進化する",
    "バランスが良い！次はさらに上へ！"
  ],
  7: [
    "7問正解！かなりの実力者だね",
    "合格ライン突破！素晴らしい正解率",
    "次は8問、君なら余裕でいけるよ",
    "君の頭脳、キレてる！ナイス7点",
    "素晴らしい！自信を持って突き進もう",
    "最高にクールだ！次はさらに上へ",
    "7点の輝き！もはやマスターだね",
    "君の努力の結果だ、胸を張ろう！"
  ],
  8: [
    "8問正解！秀才だ！ほぼ完璧だね",
    "君に教えることは少ない。次、満点",
    "圧倒的な実力！素晴らしい結果だよ",
    "尊敬しちゃうな。次は全問正解だ！",
    "天才の片鱗が見える。文句なしだ",
    "ナイス8点！君こそ真のチャレンジャー",
    "最高レベルのスコア。本当にお見事",
    "君の実力なら満点も夢じゃない！"
  ],
  9: [
    "9問正解！超絶惜しい！ほぼ神だ",
    "あと1問で完璧だった、でも凄い！",
    "君のミスは運だけ。天才の領域だ",
    "驚異的なスコア！もはやクイズ王だ",
    "もはや教えることはない。次、満点",
    "素晴らしい！君の頭脳は宇宙一に近い",
    "次は完璧を掴めるはず。感服だよ！",
    "9点の重み！君こそ最高の挑戦者だ"
  ],
  10: [
    "全問正解！神領域！君は伝説だ",
    "完璧すぎる！100点満点、お見事！",
    "もはや教えることはない。宇宙一だ",
    "圧倒的勝利！君こそ真のマスターだ",
    "言葉を失うほど完璧。君こそが王だ",
    "神懸かってるね！完璧な結果だよ",
    "全問突破、おめでとう！君は最強だ",
    "努力と才能の結晶。完璧な勝利だ！"
  ]
};

// --- Utility: Image Resizing for Token Optimization ---
// Geminiは縦横とも384px以下の画像を最小トークン数(258)で処理する。
// 384を超えるとタイル分割されてトークン数が数倍になるため、384に収める
const resizeImage = async (file: File, maxWidth = 384): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve(base64);
    };
    img.onerror = reject;
  });
};

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

const FALLBACK_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

// 2.5系はデフォルトで思考(thinking)が有効になり応答が大幅に遅くなるため無効化する。
// 2.0系はthinkingConfig未対応（指定すると400エラー）のため付けない
const buildModelConfig = (modelName: string) =>
  modelName.includes('2.0') ? {} : { thinkingConfig: { thinkingBudget: 0 } };

// 直近の成功/失敗から学習した「一度に送る画像枚数」（セッション中は維持）
let adaptiveMaxImages = IMAGE_BATCH_LEVELS[0];

// これより速く成功したら、次回は枚数を1段戻す
const FAST_RESPONSE_MS = 20000;

// 混雑(503)等の一時的エラー時、モデルを替えながら最大2周まで再試行する
const MAX_FALLBACK_ROUNDS = 2;
const ROUND_BACKOFF_MS = 3000;

async function withModelFallback<T>(
  run: (modelName: string) => Promise<T>,
  onRetry?: (modelName: string, e: unknown) => void
): Promise<T> {
  let lastError: unknown;
  for (let round = 0; round < MAX_FALLBACK_ROUNDS; round++) {
    if (round > 0) await sleep(ROUND_BACKOFF_MS * round);
    for (const modelName of FALLBACK_MODELS) {
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

export const generateQuizFromImages = async (
  files: File[],
  stats: ImageStat[],
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void
): Promise<QuizGenerationResult> => {
  const ai = createAiClient();

  // 抽選順（優先度順）で受け取り、送信時に先頭N枚だけ使う（Nは混雑状況で増減）
  const drawnIndices = selectImagesForQuiz(stats);
  console.log("Selected image indices for quiz:", drawnIndices);

  onProgress("画像を解析して遊び方を考えています...");
  const resizedByDrawOrder = await Promise.all(
    drawnIndices.map(i => resizeImage(files[i]))
  );

  const teacherStyle = teacher === TeacherType.AMANO ? "少し厳しく、応用力を試す" : "丁寧で基礎を重視した";

  let modeInstructions: string;
  if (mode === GameMode.QUIZ) {
    modeInstructions = `【クイズモード】
    - 目的: エンターテインメント、創造性、ひらめき。
    - 内容: 画像の内容を「きっかけ」として、そこから連想される自由な知識、なぞなぞ、雑学を出題する。
    - 重要ルール: 画像に直接書かれている単語を当てるだけの問題は避け、一段階ひねった問題にする。
    - 手法例:
      1. なぞなぞ化: 連想ゲームや言葉遊びを用いる。
      2. 関連知識: 画像から連想される意外な歴史や雑学。
    - プレイヤーが驚くような、自由度の高い出題を心がける。`;
  } else if (teacher === TeacherType.AMANO) {
    modeInstructions = `【べんきょうモード・あまの先生】
    - 目的: 画像で扱われている学習テーマ・単元への理解を深め、応用力を鍛えること。雑学・なぞなぞ・言葉遊びには絶対に逃げないこと（それは「クイズモード」の役割であり、ここでは禁止）。
    - 手順: まず画像から「学習テーマ」（例: 2桁の足し算、〇〇という漢字、〇〇の単元、特定の理科・社会の概念など）を認識する。そのうえで、同じテーマ・同じ形式のまま、画像とは異なる具体例に置き換えた応用問題を新たに作成する。
    - 計算問題の場合: 画像と同じ演算・同じ桁数の問題を、画像に書かれていない別の数値で出題する（画像の数式や答えをそのまま流用しない）。
    - 漢字・語句の場合: 画像に登場した漢字・語句について、画像内では使われていない別の読み方（音読み/訓読み）・別の熟語・別の文脈での使い方を問う。
    - その他の教科の場合: 画像の単元・概念を使い、画像には書かれていない一段階発展した応用問題にする。
    - 禁止: 画像の内容（数値・文章・図）をほぼそのまま使い回すこと。
    - 解説: 元の画像のテーマとどうつながっているか、応用のポイントを教育的に説明する。`;
  } else {
    modeInstructions = `【べんきょうモード・すなお先生】
    - 目的: 学習内容の着実な理解と基礎知識の定着。
    - 内容: 画像内のテキスト、図表、数式、写真から読み取れる情報を"そのまま"問う。画像に書かれている数値・語句・図をほぼそのまま使った直接的な問題にする。
    - 禁止: 画像の数値や語句を別のものに置き換えたり、応用・発展させたりしないこと。
    - 解説: なぜその答えになるのか、画像内のどの部分が重要なのかを教育的に説明する。`;
  }

  const prompt = `提供された画像の解析結果をもとに、4択クイズを${TOTAL_QUESTIONS}問、JSON形式で作成してください。
共通ルール：
1. 【画像参照の禁止】: 独立したクイズとして成立させてください。
2. 【言語】: 子供向けの楽しい日本語を使用。
3. 【先生スタイル】: ${teacherStyle}性格で出題。
4. 【元画像の明示】: 各問題について、その問題の元になった画像の番号（送信順で0始まり）をsourceImageIndexとして必ず含めてください。
5. 【選択肢の均質化】: 4つの選択肢は、文字数・文体・読み仮名（ふりがな）や補足説明の有無をすべて揃えてください。正解の選択肢にだけ読み仮名や注釈を付けたり、他より詳しく書いたりしないこと。選択肢の見た目や書き方の違いから正解が推測できてはいけません。
モード別指示:
${modeInstructions}`;

  return queuedRequest(async () => {
    onProgress("AIがワクワクする問題を作成中...");

    let sendCount = initialBatchSize(adaptiveMaxImages, drawnIndices.length);

    return withModelFallback(
      async (modelName) => {
        // 抽選順の先頭 sendCount 枚を、ページ順に並べ替えて送信する
        const picked = drawnIndices
          .map((imageIndex, drawPos) => ({ imageIndex, drawPos }))
          .slice(0, sendCount)
          .sort((a, b) => a.imageIndex - b.imageIndex);
        const attemptIndices = picked.map(p => p.imageIndex);
        const imageParts = picked.map(p => ({
          inlineData: { data: resizedByDrawOrder[p.drawPos], mimeType: "image/jpeg" }
        }));

        console.log(`Trying model: ${modelName} (images: ${attemptIndices.length})`);
        const startedAt = Date.now();
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [...imageParts, { text: prompt }] },
          config: {
            responseMimeType: "application/json",
            responseSchema: quizSchema,
            ...buildModelConfig(modelName),
          },
        });

        const text = response.text || "[]";
        const data = JSON.parse(text);
        if (!Array.isArray(data) || data.length === 0) {
          throw new RetryableError("AIの応答が空でした");
        }
        const questions = data.map((q: any, i: number) => ({
          ...q,
          id: `q-${i}-${Date.now()}`
        }));

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
      }
    );
  });
};

/**
 * 最終アドバイス（キャッチコピー）の取得
 */
export const generateAdvice = async (correctCount: number): Promise<string> => {
  const pool = ADVICE_POOL[Math.max(0, Math.min(10, correctCount))] || ADVICE_POOL[0];
  const randomIndex = Math.floor(Math.random() * pool.length);
  return Promise.resolve(pool[randomIndex]);
};

/**
 * 特定の問題に対する詳細な解説を生成する
 */
export const generateDetailedExplanation = async (question: QuizQuestion, teacher: TeacherType): Promise<string> => {
  const ai = createAiClient();

  const teacherContext = teacher === TeacherType.AMANO ? "厳しくも愛のある鋭い視点" : "優しく丁寧で、基礎から噛み砕いた視点";

  const prompt = `以下のクイズ問題について、子供が納得できるように、なぜその答えになるのかを詳しく解説してください。
  
【問題】: ${question.question}
【選択肢】: ${question.options.join(', ')}
【正解】: ${question.options[question.correctAnswerIndex]}
【元の解説】: ${question.explanation}

指示：
1. ${teacherContext}で説明してください。
2. 専門用語はなるべく避け、イメージしやすい例え話などを使ってください。
3. 「間違えても大丈夫だよ」という励ましや、「ここを覚えると天才になれるよ」といったワクワク感を最後に入れてください。
4. 全体で300文字から500文字程度で、読みやすく改行を入れて作成してください。`;

  return queuedRequest(async () => {
    try {
      return await withModelFallback(async (modelName) => {
        const response = await ai.models.generateContent({
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

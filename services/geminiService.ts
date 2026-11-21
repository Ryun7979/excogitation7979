/// <reference types="vite/client" />

import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, TeacherType, ImageStat } from "../types";
import { isRetryableApiError, isSlowdownError, RetryableError, describeApiError } from "./retryPolicy";
import { IMAGE_BATCH_LEVELS, stepDown, stepUp, initialBatchSize } from "./batchSizer";
import { getCachedAnalysis, setCachedAnalysis } from "./imageAnalysisCache";
import { sanitizeQuestions, shuffleOptions, OPTION_COUNT } from "./quizValidation";
import { assignQuizStyles } from "./quizStyles";

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

const baseQuestionProperties = {
  question: { type: Type.STRING, description: "クイズの問題文。教材で学んでいる中身（漢字・計算・語句・知識）を問う。元の画像を見なくても答えられるよう必要な情報はすべて文中に書き込む（「画像の」「何番の」等の紙面を指す言葉は使わない）" },
  options: {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    minItems: String(OPTION_COUNT),
    maxItems: String(OPTION_COUNT),
    description: "4つの選択肢（必ず4つ）",
  },
  correctAnswerIndex: { type: Type.INTEGER, description: "正解のインデックス(0-3)" },
  explanation: { type: Type.STRING, description: "解説文（100文字程度）" },
  targetAge: { type: Type.STRING, description: "推定対象学年" },
  sourceImageIndex: { type: Type.INTEGER, description: "この問題の元になった元ネタ（画像）の番号（送信順の0始まり）。この番号は記録用で、問題文には出さない" },
};
const baseQuestionKeys = ["question", "options", "correctAnswerIndex", "explanation", "targetAge", "sourceImageIndex"];

// あまの先生用: 問題文より先に「元ネタ」と「どう変えたか」を書かせる。
// 軽量モデル＋思考最小だと、先に書き出させないと元の問題をそのまま写しがちなため。
// propertyOrdering で生成順を固定する（この順に出力される）
const amanoPlanningProperties = {
  originalContent: { type: Type.STRING, description: "元画像に実際に載っていた問題・数値・語句（短く書き写す）" },
  learningTheme: { type: Type.STRING, description: "元画像の学習テーマ・単元（例: くり上がりのある2桁のたし算）" },
  twist: { type: Type.STRING, description: "元の内容から何をどう変えて応用問題にしたか（数値・具体例・場面・問い方の変更点）" },
};

// クイズモード用: 割り当てたスタイルと「へえ！」ポイントを先に書かせ、
// 「画像の○○は何？」型の素直な問題に流れないようにする
const quizPlanningProperties = {
  quizStyle: { type: Type.STRING, description: "この問題に割り当てられた出題スタイル名（指示のとおりに書き写す）" },
  hook: { type: Type.STRING, description: "この問題の「へえ！」「なるほど！」ポイント（答えを知って驚く・笑う理由）を一言で" },
};

const buildQuizSchema = (mode: GameMode, teacher: TeacherType) => {
  const planning = mode === GameMode.QUIZ
    ? quizPlanningProperties
    : teacher === TeacherType.AMANO ? amanoPlanningProperties : {};
  const keys = [...Object.keys(planning), ...baseQuestionKeys];
  return {
    type: Type.ARRAY,
    minItems: String(TOTAL_QUESTIONS),
    maxItems: String(TOTAL_QUESTIONS),
    items: {
      type: Type.OBJECT,
      properties: { ...planning, ...baseQuestionProperties },
      required: keys,
      propertyOrdering: keys,
    },
  };
};

// 2.0系は提供終了(404)。'-latest'系エイリアスは中身が勝手に変わり、応答が返らないこともあるため
// バージョン固定名を使う。世代(3.5/2.5)を交互に並べ、片方の混雑時にもう片方へ逃がす
const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

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

// --- 2フェーズ生成（隠し機能・デフォルトON） ---
// フェーズ1: 画像→テキスト要約（重い・画像込み）。File参照でキャッシュし、
//   同じ画像は二度と解析しない。モデル切替リトライ・枚数を減らした再試行・
//   「もういちど」再プレイのすべてでこのキャッシュが再利用される。
// フェーズ2: テキスト要約→クイズ（軽い・画像なし）。失敗しても画像を送り直さず再試行できる。
const analysisSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      // 先に教材の種類を書かせ、要約が「紙面の説明」ではなく「学習内容の書き出し」になるようにする
      materialType: {
        type: Type.STRING,
        description: "教材の種類と学年の目安（例: 小3の漢字ドリル、小2の計算ドリル（2けたのひき算）、英単語のワーク、理科の教科書）"
      },
      summary: {
        type: Type.STRING,
        description: "その教材で学習している中身（漢字と読み・計算問題の式・語句・事実・数値など）の書き出し。問題番号・ページ番号・レイアウトは書かない"
      },
    },
    required: ["materialType", "summary"],
    propertyOrdering: ["materialType", "summary"],
  },
};

const buildAnalysisPrompt = (count: number) =>
  `${count}枚の画像それぞれについて、何の教材かを見きわめ、その教材で学習している中身を日本語で書き出してください。
後でこの書き出しだけを使って「教材の中身についての問題」（漢字ドリルなら漢字の問題、計算ドリルなら計算問題）を作ります。

■ materialType: 教材の種類と学年の目安（例: 小3の漢字ドリル、小2の計算ドリル、英単語のワーク、理科の教科書、地図、図鑑、絵本）。
■ summary: 学習テーマ（単元名）を最初に書き、続けて学習内容をひとつ残らず具体的に書き出す。教材の種類に応じて次のように書く。
  - 漢字ドリル・ことば: 出てくる漢字・言葉ごとに、読み（音読み・訓読み）、送りがな、例の言葉や例文、意味。
  - 計算ドリル・算数: 載っている計算問題の式をすべて書く（答えが分かれば答えも）。文章題は文章と数値をそのまま書く。
  - 英語: 単語・表現とその意味。
  - 理科・社会・説明文・図鑑: 大事な語句・事実・数値・しくみ。
  - 図・グラフ・表・絵: 何が・いくつ・どんな値か・どんな形や色かを言葉で説明する。
■ 書かないもの: 問題番号（①、問3 など）、ページ番号、「左上に」「2段目に」などの紙面の位置、枠・記入欄・マークなど、学習内容と関係のない紙面の情報。
画像が横向き・逆さまに回転している場合は、正しい向きに直したつもりで読み取ってください（縦書きの文字は右の行から上→下に読む）。回転していたことは書かず、正しい向きで見た内容だけを書いてください。
画像の送信順に、JSON配列で1画像1要素として返してください（配列の要素数は必ず${count}個）。`;

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
    const { originalContent, learningTheme, twist, quizStyle, hook, ...rest } = q as any;
    if (twist) console.log(`[作問メモ] 元: ${originalContent} / テーマ: ${learningTheme} / 変更: ${twist}`);
    if (quizStyle) console.log(`[作問メモ] 問${i + 1} スタイル: ${quizStyle} / ポイント: ${hook}`);
    // AIは正解を前の方に置きがちなので、選択肢の並びをシャッフルする
    return { ...shuffleOptions(rest as QuizQuestion), id: `q-${i}-${now}` };
  });
};

async function generateQuizSinglePhase(
  ai: GoogleGenAI,
  attemptIndices: number[],
  getResizedBase64: (fileIndex: number) => Promise<string>,
  prompt: string,
  quizSchema: object,
  modelName: string,
): Promise<QuizQuestion[]> {
  const imageParts = await Promise.all(attemptIndices.map(async i => ({
    inlineData: { data: await getResizedBase64(i), mimeType: "image/jpeg" }
  })));
  const response = await ai.models.generateContent({
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
  ai: GoogleGenAI,
  files: File[],
  attemptIndices: number[],
  getResizedBase64: (fileIndex: number) => Promise<string>,
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
      inlineData: { data: await getResizedBase64(i), mimeType: "image/jpeg" }
    })));
    const response = await ai.models.generateContent({
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
  const contents = `${prompt}\n\n===== 画像の解析結果（元ネタ） =====\n${analysisBlock}\n===== ここまで =====\n\n上の指示に従って${TOTAL_QUESTIONS}問を作成してください。`;
  const response = await ai.models.generateContent({
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
  const ai = createAiClient();

  // 抽選順（優先度順）で受け取り、送信時に先頭N枚だけ使う（Nは混雑状況で増減）
  const drawnIndices = selectImagesForQuiz(stats);
  console.log("Selected image indices for quiz:", drawnIndices, "fastRetry:", useFastRetry);

  // 画像リサイズは実際に送信が必要になった時点で行う（解析済みキャッシュがあれば不要）
  const resizedCache = new Map<number, string>();
  const getResizedBase64 = async (fileIndex: number): Promise<string> => {
    let base64 = resizedCache.get(fileIndex);
    if (!base64) {
      base64 = await resizeImage(files[fileIndex]);
      resizedCache.set(fileIndex, base64);
    }
    return base64;
  };

  const teacherStyle = teacher === TeacherType.AMANO ? "少し厳しく、応用力を試す" : "丁寧で基礎を重視した";

  let modeInstructions: string;
  if (mode === GameMode.QUIZ) {
    // 1問ごとに違う出題スタイルを割り当てる（任せると同じ型に偏るため）。毎回シャッフル
    const styleLines = assignQuizStyles(TOTAL_QUESTIONS)
      .map((st, i) => `  問${i + 1}: 【${st.name}】${st.howTo}（例: ${st.example}）`)
      .join('\n');
    modeInstructions = `【クイズモード】目的: 画像をきっかけに、子供が「へえ！」「なるほど！」「そういうことか！」と言いたくなる、遊びとして面白いクイズを作ること。

■ 出題スタイルの割り当て（必ずこの順番・このスタイルで作る。例は形の参考で、題材は画像から選ぶ）
${styleLines}

■ 各問題の作り方（出力の項目もこの順に書く）
  1. quizStyle: 割り当てられたスタイル名をそのまま書き写す。
  2. hook: この問題の「へえ！」ポイント（答えを知ったときに驚く・笑う理由）を一言で書く。そのスタイルで面白い問題になる題材が見つからなければ、別の画像の題材に変える（スタイルは変えない）。
  3. question 以降: quizStyle と hook を反映した問題を作る。

■ 面白くするコツ
  - 題材は教材で学んでいる中身（漢字ドリルなら漢字・言葉、計算ドリルなら数や計算、理科なら生き物やしくみ）から選ぶ。問題番号やページなど紙面の作りは題材にしない。
  - 画像は「きっかけ」。画像に書かれている語句や答えをそのまま当てさせる問題は禁止。画像の題材から一歩・二歩ジャンプした話題にしてよい。
  - 画像が複数あるときは、なるべく多くの画像から題材を選び、同じ画像・同じ話題が続かないようにする。
  - 問題文の書き出しや言い回しを毎回変える（「〜は何？」「〜はどれ？」ばかりにしない）。
  - 不正解の選択肢も「ありそう」と思えるものにし、ふざけすぎない。思わず選びたくなる引っかけを1つ入れる。
  - 事実を問う問題は、図鑑や教科書にのっている確かな事実だけを使う。あやふやな雑学・都市伝説・自分で作った数字は使わない。
  - 正解はかならず1つに決まるようにする。「〜とされている」「だいたい」など、答えがあいまいになる問い方はしない。
  - なぞなぞは、答えを聞いて「なるほど！」と言える言葉遊びの仕掛け（ダジャレ・言葉の中に隠れた文字など）を必ず入れる。

■ 解説: 正解の理由に加えて、「ついでに豆知識」を一つ添える。`;
  } else if (teacher === TeacherType.AMANO) {
    modeInstructions = `【べんきょうモード・あまの先生】最重要ルール：画像の問題をそのまま出してはいけない。
画像（解析結果）は「どの単元を勉強しているか」を知るための元ネタにすぎない。問題は必ず、同じ単元・同じ考え方を使う"新しい"応用問題として作り直すこと。

■ 各問題の作り方（出力の項目もこの順に書く）
  1. originalContent: 元画像に実際に載っていた問題・数値・語句を短く書き写す。
  2. learningTheme: その学習テーマ・単元を一言で書く。
  3. twist: 元の内容から何をどう変えたかを書く。次のうち少なくとも1つ（できれば2つ）を必ず行う。
     (a) 数値・語句・具体例を、画像に無い別のものに置き換える
     (b) 文章題・生活の場面にして、同じ考え方を使わせる
     (c) 逆向きに問う（答えから式や条件を求める、穴うめにする など）
     (d) 一段階ステップを増やす（2つの知識を組み合わせる、理由を問う など）
  4. question 以降: twist に書いた変更を反映した問題を作る。

■ 良い例・悪い例
  - 元画像「23 + 18 = ?」
    悪い例:「23 + 18 はいくつ？」（そのまま）
    良い例:「47 + 35 はいくつ？」(a) /「りんごが27こ、みかんが19こあります。あわせて何こ？」(b) /「□ + 28 = 61 の□に入る数は？」(c)
  - 元画像に漢字「生」（読み: せい）
    悪い例:「『生』の読み方は？」で画像と同じ読みを答えさせる
    良い例:「『生える』の読み方は？」/「『一生けんめい』の『生』と同じ読み方をするのはどれ？」
  - 元画像「植物の成長には日光が必要」
    悪い例:「植物が育つのに必要なものは？」（画像の文をそのまま問う）
    良い例:「1週間、箱をかぶせて暗くしておいたインゲンの葉は、どうなっている？」(b)(d)

■ 禁止事項
  - originalContent と question の中身（数値・語句・文章）が同じになること。
  - 画像に書かれている答えをそのまま正解にすること。
  - 雑学・なぞなぞ・言葉遊びに逃げること（それはクイズモードの役割）。
  - 単元から外れること。難しくしすぎず、元画像と同じ学年の子が考えれば解けるレベルにする。

■ 解説: 元の画像のどの学習とつながっているか、どこが応用のポイントかを教育的に説明する。`;
  } else {
    modeInstructions = `【べんきょうモード・すなお先生】
    - 目的: 学習内容の着実な理解と基礎知識の定着。
    - 内容: 画像内のテキスト、図表、数式、写真から読み取れる情報を"そのまま"問う。画像に書かれている数値・語句・図をほぼそのまま使った直接的な問題にする。ただし画像を見せるのではなく、必要な数値・語句・図表の内容は問題文の中に言葉で書き込む。
    - 禁止: 画像の数値や語句を別のものに置き換えたり、応用・発展させたりしないこと。
    - 解説: なぜその答えになるのか、画像内のどの部分が重要なのかを教育的に説明する。`;
  }

  const quizSchema = buildQuizSchema(mode, teacher);

  // モード別指示は最も守ってほしいルールなので先頭に置く（末尾だと画像の内容に引っ張られやすい）
  const prompt = `提供された画像（または画像の解析結果）をもとに、4択クイズを${TOTAL_QUESTIONS}問、JSON形式で作成してください。

${modeInstructions}

共通ルール：
0. 【教材の中身を問う】: まず画像（解析結果）が何の教材かを見きわめ、その教材で学習している中身そのものを題材にする。
   - 漢字ドリル・ことば → 載っている漢字・言葉の読み・書き・送りがな・意味・熟語・使い方・画数・部首
   - 計算ドリル・算数 → 載っている計算問題（またはそれをもとにした計算）を解かせる
   - 英語 → 単語・表現の意味や使い方
   - 理科・社会・説明文・図鑑 → 書かれている知識・事実・しくみ
   - 禁止: 紙面の作りについての問題。問題番号・ページ・「何番」「何問目」「どこに書いてある」「いくつ問題がある」「どんな教材か」などを問わない。
     悪い例:「画像の3番は何ですか？」「『海』はドリルの何番に出てくる？」「このドリルには計算問題がいくつある？」
     良い例:「『海』の読み方はどれ？」「36 − 19 はいくつ？」
1. 【画像参照の禁止】: 遊ぶ子供は元の画像を見られません。問題文と選択肢だけで答えられる、独立したクイズにしてください。
   - 「画像の」「この図で」「写真の」「上の表」「左の絵」「〇ページの」「問3の」「〇番の」など、元の画像や紙面の場所・番号を指す言葉は使わない。
   - 答えるのに必要な数値・語句・条件・図表の内容は、画像の内容を読み取ったうえで問題文の中に言葉で書き込む。
     悪い例:「グラフで一番多い果物はどれ？」
     良い例:「好きな果物を調べたら、りんご12人・みかん8人・ぶどう5人でした。一番人気の果物はどれ？」
   - 図や絵を見ないと解けない問題（形・位置・色を見て答える問題など）は、言葉で説明して解ける形に直すか、別の題材に変える。
   - 画像が横向き・逆さまに回転している場合は、正しい向きに直したつもりで文字や図を読み取る。
2. 【言語】: 子供向けの楽しい日本語を使用。
3. 【先生スタイル】: ${teacherStyle}性格で出題。
4. 【元画像の明示】: 各問題について、その問題の元になった画像の番号（送信順で0始まり）をsourceImageIndexとして必ず含めてください。
5. 【選択肢の均質化】: 4つの選択肢は、文字数・文体・読み仮名（ふりがな）や補足説明の有無をすべて揃えてください。正解の選択肢にだけ読み仮名や注釈を付けたり、他より詳しく書いたりしないこと。選択肢の見た目や書き方の違いから正解が推測できてはいけません。`;

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
          ? await generateQuizTwoPhase(ai, files, attemptIndices, getResizedBase64, prompt, quizSchema, modelName, onProgress)
          : await generateQuizSinglePhase(ai, attemptIndices, getResizedBase64, prompt, quizSchema, modelName);

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

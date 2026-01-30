
import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, TeacherType } from "../types";

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
const resizeImage = async (file: File, maxWidth = 1024): Promise<string> => {
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

// --- API Throttle & Queue Logic ---
const MIN_REQUEST_INTERVAL = 4000; 
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

  requestQueue = result.then(() => {}).catch(() => {});
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
    },
    required: ["question", "options", "correctAnswerIndex", "explanation", "targetAge"],
  },
};

export const generateQuizFromImages = async (
  files: File[], 
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void
): Promise<QuizQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  onProgress("画像を解析して遊び方を考えています...");
  const imageParts = await Promise.all(files.map(async (file) => {
    const base64 = await resizeImage(file);
    return { inlineData: { data: base64, mimeType: "image/jpeg" } };
  }));

  const teacherStyle = teacher === TeacherType.AMANO ? "少し意地悪で応用力をためす" : "丁寧で基礎を重視した";
  
  const modeInstructions = mode === GameMode.STUDY 
    ? `【べんきょうモード】
    - 目的: 学習内容の着実な理解と基礎知識の定着。
    - 内容: 画像内のテキスト、図表、数式、写真から読み取れる直接的な情報を問う。
    - 解説: なぜその答えになるのか、画像内のどの部分が重要なのかを教育的に説明する。`
    : `【クイズモード】
    - 目的: エンターテインメント、創造性、ひらめき。
    - 内容: 画像の内容を「きっかけ」として、そこから連想される自由な知識、なぞなぞ、雑学を出題する。
    - 重要ルール: 画像に直接書かれている単語を当てるだけの問題は避け、一段階ひねった問題にする。
    - 手法例:
      1. なぞなぞ化: 連想ゲームや言葉遊びを用いる。
      2. 関連知識: 画像から連想される意外な歴史や雑学。
    - プレイヤーが驚くような、自由度の高い出題を心がける。`;

  const prompt = `提供された画像の解析結果をもとに、4択クイズを${TOTAL_QUESTIONS}問、JSON形式で作成してください。
共通ルール：
1. 【画像参照の禁止】: 独立したクイズとして成立させてください。
2. 【言語】: 子供向けの楽しい日本語を使用。
3. 【先生スタイル】: ${teacherStyle}性格で出題。
モード別指示:
${modeInstructions}`;

  return queuedRequest(async () => {
    onProgress("AIがワクワクする問題を作成中...");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: quizSchema,
      },
    });

    const text = response.text || "[]";
    try {
      const data = JSON.parse(text);
      return data.map((q: any, i: number) => ({
        ...q,
        id: `q-${i}-${Date.now()}`
      }));
    } catch (e) {
      console.error("JSON parse error:", text);
      throw new Error("AIの応答を処理できませんでした。");
    }
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || "解説の生成に失敗しました。もう一度試してみてね。";
  });
};

export const getApiStatus = () => {
    if (isBusy) {
        return { status: 'busy' as const, label: 'AI思考中...' };
    }
    return { status: 'ok' as const, label: 'AI準備完了' };
};

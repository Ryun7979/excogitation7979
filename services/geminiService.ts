
import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, QuizResult, TeacherType } from "../types";

// --- Utility: Image Resizing for Token Optimization ---
/**
 * 画像をAIに送信する前に適切なサイズ（最大1024px）に縮小します。
 * これにより、アップロード時間の短縮、APIのタイムアウト防止、およびトークン消費の節約が可能です。
 */
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
      
      // JPEG形式で圧縮してBase64化
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
  
  onProgress("画像を最適化中...");
  // 画像をリサイズしてからBase64に変換（APIの負担を軽減）
  const imageParts = await Promise.all(files.map(async (file) => {
    const base64 = await resizeImage(file);
    return { inlineData: { data: base64, mimeType: "image/jpeg" } };
  }));

  const teacherStyle = teacher === TeacherType.AMANO ? "少し意地悪で応用力を試す" : "丁寧で基礎を重視した";
  const gameModeGoal = mode === GameMode.STUDY ? "学習内容の定着を助ける" : "知的好奇心を刺激する面白い";

  const prompt = `提供された学習資料の画像を解析し、その内容に基づいた4択クイズを${TOTAL_QUESTIONS}問、JSON形式で作成してください。

重要ルール：
1. 【画像参照の禁止】: プレイヤーは回答中に画像を見ることができません。そのため、「画像を見て答えなさい」「図1の〜」「この写真に写っているものは？」といった、画像がないと解けない表現は【絶対に】使わないでください。画像から得られた「知識」そのものを問う形式にしてください。
2. 【独立性】: 各問題は単独で成立させてください。「さっきの問題の続きですが〜」などの依存関係は禁止です。
3. 【言語設定】: 子供が理解しやすい日本語を使ってください。

- 出題スタイル: ${teacherStyle}
- 目的: ${gameModeGoal}
- 難易度: 画像の内容に合わせ、後半に向けて少しずつ難しくしてください。
- 解説: 画像内の重要ポイントを補足してください。`;

  return queuedRequest(async () => {
    onProgress("AIが画像から問題を考えています...");
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
      throw new Error("AIの応答形式が正しくありませんでした。");
    }
  });
};

export const generateAdvice = async (questions: QuizQuestion[], results: QuizResult[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const correctCount = results.filter(r => r.isCorrect).length;
  
  const prompt = `生徒が10問中${correctCount}問正解しました。
結果を見て、生徒のやる気を引き出す熱いメッセージ（50文字以内）を1つ作成してください。`;

  return queuedRequest(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || "君の可能性は無限大だ！";
  });
};

export const getApiStatus = () => {
    if (isBusy) {
        return { status: 'busy' as const, label: 'AI思考中...' };
    }
    return { status: 'ok' as const, label: 'AI準備完了' };
};

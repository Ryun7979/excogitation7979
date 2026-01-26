import { GoogleGenAI, Type, Schema } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, QuizResult, TeacherType } from "../types";

// --- Helper Functions ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- API Usage Tracking & Throttling ---
const STORAGE_KEY_HISTORY = 'gemini_req_history';
const STORAGE_KEY_ERROR = 'gemini_last_error';

const MIN_REQUEST_INTERVAL = 5000; 

let requestQueue = Promise.resolve();
let lastRequestTime = 0;

const getHistory = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
  } catch { return []; }
};

const trackRequest = () => {
  const now = Date.now();
  const history = getHistory();
  const validHistory = history.filter(t => t > now - 60000);
  validHistory.push(now);
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(validHistory));
};

const trackError = () => {
  localStorage.setItem(STORAGE_KEY_ERROR, Date.now().toString());
};

export const getApiStatus = () => {
  const now = Date.now();
  const lastError = parseInt(localStorage.getItem(STORAGE_KEY_ERROR) || '0');
  const cooldownTime = 60 * 1000; 

  if (now - lastError < cooldownTime) {
     return { 
       status: 'error' as const, 
       remaining: Math.ceil((cooldownTime - (now - lastError)) / 1000),
       label: '休憩中'
     };
  }

  const history = getHistory().filter(t => t > now - 60000);
  if (history.length >= 10) { 
     return { status: 'warning' as const, label: '混雑気味' };
  }

  return { status: 'ok' as const, label: '元気' };
};

const getErrorDetails = (error: any) => {
    let message = "";
    if (typeof error === 'string') {
        message = error;
    } else if (error instanceof Error) {
        message = error.message;
    } else if (error && typeof error === 'object') {
        if (error.error?.message) {
            message = error.error.message;
        } else if (error.message) {
            message = error.message;
        } else {
            try {
                message = JSON.stringify(error);
            } catch {
                message = "Unknown error";
            }
        }
    } else {
        message = String(error);
    }
    
    const lowerMsg = message.toLowerCase();
    const isSafetyError = lowerMsg.includes('safety') || lowerMsg.includes('blocked');
    const isRateLimit = lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted') || lowerMsg.includes('quota') || lowerMsg.includes('limit');
    const isServerError = lowerMsg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('fetch failed') || lowerMsg.includes('gateway');

    const isRetryable = (isRateLimit || isServerError) && !isSafetyError;

    return { message, isRateLimit, isSafetyError, isRetryable };
};

const resizeImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 512; 

      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
          reject(new Error('Canvas context error'));
          return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      resolve(dataUrl.split(',')[1]);
    };

    img.onerror = () => reject(new Error('Image load error'));
    reader.readAsDataURL(file);
  });
};

const fileToPart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  try {
    const base64Data = await resizeImage(file);
    return {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    };
  } catch (e) {
    console.error("Image processing failed", e);
    throw new Error('画像の読み込み・圧縮に失敗しました。');
  }
};

async function retryOperation<T>(
  operation: () => Promise<T>, 
  retries: number = 3, 
  baseDelay: number = 2000
): Promise<T> {
  
  const result = requestQueue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - lastRequestTime;
      
      if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await sleep(MIN_REQUEST_INTERVAL - timeSinceLast);
      }

      try {
        lastRequestTime = Date.now();
        trackRequest();
        return await operation();
      } catch (error: any) {
        throw error;
      }
  });

  requestQueue = result.then(() => {}).catch(() => {});

  try {
    return await result;
  } catch (error: any) {
    const { isRateLimit, isRetryable, message } = getErrorDetails(error);

    if (isRateLimit) {
        trackError();
        throw error;
    }

    if (retries > 0 && isRetryable) {
      const delay = baseDelay;
      await sleep(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }
    
    throw error;
  }
}

const quizSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctAnswerIndex: { type: Type.INTEGER },
      explanation: { type: Type.STRING },
      targetAge: { type: Type.STRING },
    },
    required: ["question", "options", "correctAnswerIndex", "explanation", "targetAge"],
  },
};

const getApiKey = () => {
  // Try to get from process.env (Vercel/Node style) or global shim
  return (typeof process !== 'undefined' && process.env?.API_KEY) || undefined;
};

const generateBatch = async (
  ai: GoogleGenAI,
  imageParts: any[],
  count: number,
  mode: GameMode,
  teacher: TeacherType,
  previousQuestions?: QuizQuestion[],
  previousResults?: QuizResult[]
): Promise<any[]> => {
    let teacherInstruction = teacher === TeacherType.AMANO ? `【担当：あまの先生】画像から一歩踏み込んだ応用問題を${count}問作成。` : `【担当：すなお先生】画像の資料に基づいた忠実な問題を${count}問作成。`;
    let modeInstruction = mode === GameMode.STUDY ? `【勉強モード】画像から対象学年を推定し学習に役立つ問題を。` : `【クイズモード】画像に写っているものから大胆に発想を広げた雑学問題にアレンジしてください。`;

    let replayInstruction = (previousQuestions && previousResults) ? `前回の問題と同じものは避けてください: ${JSON.stringify(previousQuestions.map(q => q.question))}` : "";

    const prompt = `あなたはベテラン教師です。提供画像を分析し、${count}問の4択クイズを作成してください。出力はJSON形式のみ。${teacherInstruction} ${modeInstruction} ${replayInstruction}`;

    const response = await retryOperation(async () => {
      return await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [...imageParts, { text: prompt }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: quizSchema,
        },
      });
    });

    if (!response.text) throw new Error("AI response was empty");
    return JSON.parse(response.text);
};

export const generateQuizFromImages = async (
  files: File[], 
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void,
  previousQuestions?: QuizQuestion[],
  previousResults?: QuizResult[]
): Promise<QuizQuestion[]> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("APIキーが設定されていません。\n\n【解決策】\n1. VercelのSettings > Environment Variablesで API_KEY を設定してください。\n2. 設定後、[Redeploy] を実行して設定を反映させてください。");
    }

    const ai = new GoogleGenAI({ apiKey });
    onProgress(`${files.length}枚の画像を処理中...`);
    const imageParts = await Promise.all(files.map(fileToPart));
    onProgress(`AIが${TOTAL_QUESTIONS}問を作成中...`);

    const allResults = await generateBatch(ai, imageParts, TOTAL_QUESTIONS, mode, teacher, previousQuestions, previousResults);
    return allResults.map((q: any, index: number) => ({
      id: `q-${index}-${Date.now()}`,
      question: q.question,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
      targetAge: q.targetAge, 
    })).slice(0, TOTAL_QUESTIONS);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const { isRateLimit, isSafetyError } = getErrorDetails(error);
    if (isRateLimit) throw new Error("たくさん遊んでくれてありがとう！AIが少し疲れたみたいです。1分ほど休憩してね。");
    if (isSafetyError) throw new Error("画像の内容が安全基準によりブロックされました。別の画像を試してみてね。");
    throw error;
  }
};

export const generateDetailedExplanation = async (question: QuizQuestion): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `以下のクイズの詳しい解説を300文字以内で作成してください。問題: ${question.question} 正解: ${question.options[question.correctAnswerIndex]} 現状の解説: ${question.explanation}`;
  const response = await retryOperation(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
    });
  });
  return response.text || "解説の生成に失敗しました。";
};

export const generateAdvice = async (questions: QuizQuestion[], results: QuizResult[]): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });
  const score = Math.round((results.filter(r => r.isCorrect).length / questions.length) * 100);
  const prompt = `生徒のクイズ結果(${score}点)への短いアドバイス(100文字以内)。`;
  const response = await retryOperation(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
    });
  });
  return response.text || "よくがんばりました！";
};
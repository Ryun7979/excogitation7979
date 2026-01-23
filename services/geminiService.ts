import { GoogleGenAI, Type, Schema } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, QuizResult, TeacherType } from "../types";

// --- Helper Functions ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- API Usage Tracking & Throttling ---
const STORAGE_KEY_HISTORY = 'gemini_req_history';
const STORAGE_KEY_ERROR = 'gemini_last_error';

// Global Throttle Configuration
// 15 RPM = 4s interval. We use 5000ms to be safe and account for network latency overlaps.
const MIN_REQUEST_INTERVAL = 5000; 

// Request Queue to force strict serialization
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

/**
 * Executes an async operation with strict serialization and exponential backoff.
 */
async function retryOperation<T>(
  operation: () => Promise<T>, 
  retries: number = 3, 
  baseDelay: number = 2000
): Promise<T> {
  
  // Enqueue the request to ensure strict serialization (No concurrency)
  const result = requestQueue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - lastRequestTime;
      
      // Enforce minimum interval
      if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await sleep(MIN_REQUEST_INTERVAL - timeSinceLast);
      }

      try {
        lastRequestTime = Date.now();
        trackRequest();
        return await operation();
      } catch (error: any) {
        // We catch here to decide whether to retry or throw
        // This is inside the queue, so retries will block the queue, which is what we want for rate limits
        throw error;
      }
  });

  // Advance the queue cursor, handling errors so the queue doesn't stall
  requestQueue = result.then(() => {}).catch(() => {});

  // Handle the result of the queued operation
  try {
    return await result;
  } catch (error: any) {
    const { isRateLimit, isRetryable, message } = getErrorDetails(error);

    // If Rate Limit hit, fail IMMEDIATELY so the UI can show the "Take a Break" modal.
    // Do not retry.
    if (isRateLimit) {
        trackError();
        console.warn(`Rate Limit hit. Stopping retries to show user feedback.`);
        throw error;
    }

    if (retries > 0 && isRetryable) {
      // For other errors (like server errors), we still retry
      const delay = baseDelay;
      console.warn(`API Issue detected (${message}). Retrying in ${delay}ms... (Retries left: ${retries})`);
      
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

const generateBatch = async (
  ai: GoogleGenAI,
  imageParts: any[],
  count: number,
  mode: GameMode,
  teacher: TeacherType,
  previousQuestions?: QuizQuestion[],
  previousResults?: QuizResult[]
): Promise<any[]> => {
    let teacherInstruction = "";
    if (teacher === TeacherType.AMANO) {
      teacherInstruction = `
      【担当：あまの先生】
      画像の情報から一歩踏み込み、「なぜそうなる？」「関連する知識は？」という応用問題を${count}問作成。
      設定された対象年齢の範囲内で少し考えさせる内容にすること。
      `;
    } else {
      teacherInstruction = `
      【担当：すなお先生】
      画像の資料に基づいた、基本的で忠実な問題を${count}問作成。
      学校のテストに出そうなオーソドックスな形式にすること。
      `;
    }

    let modeInstruction = "";
    if (mode === GameMode.STUDY) {
      modeInstruction = `
      【勉強モード】
      画像全体を1つの教材として分析。
      1. 画像から対象学年を推定し、それに合わせた漢字・言葉遣いにする（ルビ不要）。
      2. 複雑な図解コード(SVG)の生成は禁止。テキストのみで成立する問題にする。
      `;
    } else {
      modeInstruction = `
      【クイズモード】
      画像に写っているものから大胆に発想を広げた「雑学・トリビア問題」にすること。
      単なる写っているものの名前当てではなく、関連する歴史、由来、意外な性質、文化的な意味などを問う、知的好奇心を刺激する内容にアレンジしてください。
      解説も「へぇ〜！」と言いたくなるような豆知識を含めること。
      SVG生成禁止。
      `;
    }

    let replayInstruction = "";
    if (previousQuestions && previousResults) {
      const avoidText = JSON.stringify(previousQuestions.map(q => q.question));
      replayInstruction = `前回の問題と同じものは避けてください: ${avoidText}`;
    }

    const prompt = `
      あなたはベテラン教師です。提供画像を分析し、${count}問の4択クイズを作成してください。
      
      【ルール】
      - 視力検査のような「画像を見ないと解けない」問題は禁止。
      - 出力はJSON形式のみ。
      
      ${teacherInstruction}
      ${modeInstruction}
      ${replayInstruction}
    `;

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
    
    try {
        return JSON.parse(response.text);
    } catch (e) {
        console.error("Batch JSON Parse Error", e);
        return [];
    }
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
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("APIキーが設定されていません。");

    const ai = new GoogleGenAI({ apiKey });

    onProgress(`${files.length}枚の画像を処理中...`);
    const imageParts = await Promise.all(files.map(fileToPart));

    onProgress(`AIが${TOTAL_QUESTIONS}問を作成中... (待機列に追加)`);

    const allResults = await generateBatch(ai, imageParts, TOTAL_QUESTIONS, mode, teacher, previousQuestions, previousResults);
    
    if (allResults.length === 0) throw new Error("問題データが生成されませんでした。");

    onProgress("データを仕上げています...");

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
    
    const { message, isRateLimit, isSafetyError } = getErrorDetails(error);

    let userMessage = "予期せぬエラーが発生しました。";
    
    if (isRateLimit) {
        userMessage = "たくさん遊んでくれてありがとう！\nAIが少し疲れたみたいです。\n\n1分ほど休憩してから、また遊んでね！";
    } else if (isSafetyError) {
        userMessage = "画像の内容が安全基準によりブロックされました。";
    } else {
        userMessage = message || userMessage;
    }
    
    throw new Error(userMessage);
  }
};

export const generateDetailedExplanation = async (question: QuizQuestion): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing.");
    const ai = new GoogleGenAI({ apiKey });

    const targetInfo = question.targetAge ? `対象: ${question.targetAge}` : "対象: 小学生〜中学生";

    const prompt = `
      以下のクイズの詳しい解説を300文字以内で作成してください。
      **${targetInfo}** に合わせた言葉遣い（難しい漢字はひらがな）。
      
      問題: ${question.question}
      正解: ${question.options[question.correctAnswerIndex]}
      現状の解説: ${question.explanation}
    `;

    const response = await retryOperation(async () => {
      return await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "text/plain",
        },
      });
    });

    return response.text || "解説の生成に失敗しました。";
  } catch (error) {
    console.error("Detailed Explanation Error:", error);
    throw new Error("解説を生成できませんでした。");
  }
};

export const generateAdvice = async (questions: QuizQuestion[], results: QuizResult[]): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing.");
    
    const ai = new GoogleGenAI({ apiKey });

    const summaryData = questions.map((q, i) => ({
      q: q.question.length > 30 ? q.question.substring(0, 30) + "..." : q.question, 
      ok: results[i]?.isCorrect,
    }));

    const correctCount = results.filter(r => r.isCorrect).length;
    const score = Math.round((correctCount / questions.length) * 100);

    const prompt = `
      生徒のクイズ結果(${score}点)への短いアドバイス(100文字以内)。
      データ: ${JSON.stringify(summaryData)}
    `;

    const response = await retryOperation(async () => {
      return await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "text/plain",
        },
      });
    });

    return response.text || "よくがんばりました！";

  } catch (error) {
    console.error("Advice Generation Error:", error);
    return "おつかれさま！結果を確認して復習してみよう！";
  }
};

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { QuizQuestion, TOTAL_QUESTIONS, GameMode, QuizResult, TeacherType } from "../types";

// --- Utility: Wait function ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- API Throttle & Queue Logic ---
const MIN_REQUEST_INTERVAL = 4000; 
let requestQueue = Promise.resolve();
let lastRequestTime = 0;

/**
 * Ensures API calls are made one at a time with a minimum interval.
 */
async function queuedRequest<T>(operation: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    const now = Date.now();
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL - (now - lastRequestTime));
    if (waitTime > 0) await sleep(waitTime);
    
    try {
      lastRequestTime = Date.now();
      return await operation();
    } catch (error) {
      throw error;
    }
  });

  requestQueue = result.then(() => {}).catch(() => {});
  return result;
}

const getApiKey = () => {
  return process.env.API_KEY;
};

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

/**
 * Generates a quiz from images using Gemini.
 * Fixed: Added optional parameters previousQuestions and previousResults to match the 6-argument call in App.tsx.
 */
export const generateQuizFromImages = async (
  files: File[], 
  mode: GameMode,
  teacher: TeacherType,
  onProgress: (message: string) => void,
  previousQuestions?: QuizQuestion[],
  previousResults?: QuizResult[]
): Promise<QuizQuestion[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("APIキーが未設定です。\n\nVercelのSettings > Environment Variables で 'API_KEY' を設定し、再デプロイしてください。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  onProgress("画像を解析中...");
  const imageParts = await Promise.all(files.map(async (file) => {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return { inlineData: { data: base64, mimeType: file.type } };
  }));

  const teacherPrompt = teacher === TeacherType.AMANO ? "応用とひねりを加えた" : "教科書に忠実な";
  const modePrompt = mode === GameMode.STUDY ? "学習に役立つ" : "面白い雑学を交えた";

  let prompt = `あなたはベテラン教師です。提供された画像から、${teacherPrompt}${modePrompt}4択クイズを合計${TOTAL_QUESTIONS}問作成してください。
  JSON形式で、question, options(4つ), correctAnswerIndex(0-3), explanation, targetAge(推定対象学年)を含めてください。`;

  // Handle review mode logic if previous question/result data is provided
  if (previousQuestions && previousResults) {
    const wrongQuestions = previousResults
      .filter(r => !r.isCorrect)
      .map(r => previousQuestions[r.questionIndex].question);
    
    if (wrongQuestions.length > 0) {
      prompt += `\n特に、以下の間違えた問題の内容を重点的に、復習として別の角度から出題してください：\n${wrongQuestions.join('\n')}`;
    }
  }

  return queuedRequest(async () => {
    onProgress("AIが問題を作成しています...");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: quizSchema,
      },
    });

    const data = JSON.parse(response.text || "[]");
    return data.map((q: any, i: number) => ({
      ...q,
      id: `q-${i}-${Date.now()}`
    }));
  });
};

export const generateDetailedExplanation = async (question: QuizQuestion): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "APIキーがないため解説を生成できません。";
  
  const ai = new GoogleGenAI({ apiKey });
  return queuedRequest(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `以下のクイズの詳しい解説を300文字程度で書いてください。
      問題: ${question.question}
      正解: ${question.options[question.correctAnswerIndex]}`,
    });
    return response.text || "解説を取得できませんでした。";
  });
};

export const generateAdvice = async (questions: QuizQuestion[], results: QuizResult[]): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "結果に基づいたアドバイスを生成するにはAPIキーが必要です。";

  const ai = new GoogleGenAI({ apiKey });
  const correctCount = results.filter(r => r.isCorrect).length;
  const prompt = `${TOTAL_QUESTIONS}問中${correctCount}問正解した生徒へ、優しく前向きなアドバイスを100文字以内で作成してください。`;

  return queuedRequest(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "よく頑張りましたね！";
  });
};

export const getApiStatus = () => {
    // 簡易的なステータスチェック（拡張可能）
    return { status: 'ok' as const, label: '元気' };
};

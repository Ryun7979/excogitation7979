export enum AppStage {
  TITLE = 'TITLE',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  ANALYZING = 'ANALYZING', // New stage for generating advice
  FEEDBACK = 'FEEDBACK',
  SUMMARY = 'SUMMARY',
  HISTORY = 'HISTORY', // 学習のきろく
  ERROR = 'ERROR'
}

export enum GameMode {
  QUIZ = 'QUIZ',
  STUDY = 'STUDY'
}

export enum TeacherType {
  SUNAO = 'SUNAO',
  AMANO = 'AMANO'
}

export interface ImageStat {
  timesSelected: number;  // クイズ生成でAIに送信された回数
  wrongCount: number;     // この画像から出た問題で間違えた回数
  questionCount: number;  // この画像から作られた問題の累計数
}

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

export interface QuizResult {
  questionIndex: number;
  isCorrect: boolean;
  timeTakenSeconds: number;
  chosenIndex?: number; // えらんだ選択肢
}

export interface GameState {
  stage: AppStage;
  mode: GameMode;
  teacher: TeacherType; // Selected teacher personality
  images: File[];
  imageStats: ImageStat[]; // imagesと同じ長さ・並びの統計情報
  questions: QuizQuestion[];
  /** まちがえた問題の解き直し中か（AIを呼ばず、画像の統計も変えない） */
  isReview?: boolean;
  currentQuestionIndex: number;
  results: QuizResult[];
  advice?: string; // AI generated advice
  errorMessage?: string;
  loadingMessage?: string; // Message to show during loading states
}

/** AIに作らせる1回分の問題数（解き直しでは、まちがえた問題の数になる） */
export const TOTAL_QUESTIONS = 10;

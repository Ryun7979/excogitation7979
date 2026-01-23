export enum AppStage {
  TITLE = 'TITLE',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  ANALYZING = 'ANALYZING', // New stage for generating advice
  FEEDBACK = 'FEEDBACK',
  SUMMARY = 'SUMMARY',
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

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[]; // Always 4 options
  correctAnswerIndex: number; // 0-3
  explanation: string; // The "point" of the question
  targetAge?: string; // Estimated target age/grade (e.g., "小学1年生", "中学生")
  detailedExplanation?: string; // Cached detailed explanation to avoid re-fetching
}

export interface QuizResult {
  questionIndex: number;
  isCorrect: boolean;
  timeTakenSeconds: number;
}

export interface GameState {
  stage: AppStage;
  mode: GameMode;
  teacher: TeacherType; // Selected teacher personality
  images: File[];
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  results: QuizResult[];
  advice?: string; // AI generated advice
  errorMessage?: string;
  loadingMessage?: string; // Message to show during loading states
}

export const TOTAL_QUESTIONS = 10;
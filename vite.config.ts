import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 環境変数を読み込む (.envファイル等の内容を取得)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // ローカルの .env.local 等にある GEMINI_API_KEY か、Vercelの API_KEY を process.env.API_KEY としてコードに渡す
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY)
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});

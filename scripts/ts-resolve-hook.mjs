// Node で TypeScript を直接動かすための読み替え（テスト・評価スクリプト用）。
// - 「.js」で書いた相対 import を、同じ名前の .ts に読み替える
//   （サーバー側のコード api/・server/ は Vercel で動かすため .js を付けて書いている）
// - 拡張子なしの相対 import（画面側のコードは Vite に合わせてこう書いている）に .ts / .tsx を補う
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tryUrl = (specifier, parentURL) => {
  const url = new URL(specifier, parentURL);
  return existsSync(fileURLToPath(url)) ? url.href : null;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && context.parentURL) {
      if (specifier.endsWith('.js')) {
        const ts = tryUrl(specifier.replace(/\.js$/, '.ts'), context.parentURL);
        if (ts) return nextResolve(ts, context);
      } else if (!/\.[a-z]+$/i.test(specifier)) {
        for (const ext of ['.ts', '.tsx']) {
          const found = tryUrl(specifier + ext, context.parentURL);
          if (found) return nextResolve(found, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

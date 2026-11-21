/** @type {import('tailwindcss').Config} */

// 文字の大きさは、画面の「横幅と高さの小さい方」(vmin) に合わせて連続的に変える。
// 横幅だけで段階的に変えると、ノートPC(1366×768)やスマホ横向きのような
// 横長で背の低い画面で文字が大きくなりすぎ、問題文や選択肢があふれるため。
// clamp(最小, 基準, 最大) の最小は、子どもが読める大きさ（本文16px・補足13px）を下回らないようにする。
const fluid = (min, base, max) => `clamp(${min}rem, ${base}, ${max}rem)`;

export default {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './screens/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'fl-xs': [fluid(0.8125, '0.7rem + 0.4vmin', 1), { lineHeight: '1.5' }],
        'fl-sm': [fluid(0.875, '0.75rem + 0.6vmin', 1.125), { lineHeight: '1.5' }],
        'fl-base': [fluid(1, '0.8rem + 0.9vmin', 1.375), { lineHeight: '1.6' }],
        'fl-lg': [fluid(1.125, '0.85rem + 1.3vmin', 1.75), { lineHeight: '1.45' }],
        'fl-xl': [fluid(1.25, '0.9rem + 1.8vmin', 2.25), { lineHeight: '1.35' }],
        'fl-2xl': [fluid(1.5, '1rem + 2.6vmin', 3), { lineHeight: '1.3' }],
        'fl-3xl': [fluid(1.875, '1.1rem + 3.6vmin', 4), { lineHeight: '1.15' }],
        'fl-hero': [fluid(3.5, '2rem + 9vmin', 9), { lineHeight: '1' }],
      },
      spacing: {
        'fl-1': 'clamp(0.25rem, 0.8vmin, 0.75rem)',
        'fl-2': 'clamp(0.5rem, 1.4vmin, 1.25rem)',
        'fl-3': 'clamp(0.75rem, 2.2vmin, 1.75rem)',
        'fl-4': 'clamp(1rem, 3vmin, 2.5rem)',
      },
      // 役割ごとの色。白い文字を置く背景は、コントラスト比 4.5:1 以上になる濃さにする
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f1f5f9', // slate-100
        },
        ink: {
          DEFAULT: '#1e293b', // slate-800: 白地の本文
          muted: '#475569', // slate-600: 白地の補足（7.5:1）
        },
        brand: {
          from: '#0369a1', // sky-700: 白文字 5.9:1
          to: '#4338ca', // indigo-700: 白文字 7.9:1
          accent: '#0284c7', // sky-600
        },
        ok: {
          DEFAULT: '#0f766e', // teal-700: 白文字 5.5:1
          soft: '#ccfbf1',
        },
        ng: {
          DEFAULT: '#be123c', // rose-700: 白文字 6.4:1
          soft: '#ffe4e6',
        },
      },
      borderRadius: {
        card: 'clamp(1rem, 3vmin, 2rem)',
        btn: 'clamp(0.75rem, 2vmin, 1.25rem)',
      },
      screens: {
        // 背の低い画面（スマホ横向きなど）。縦に積むと入らないので横に並べる
        short: { raw: '(max-height: 540px)' },
      },
    },
  },
  plugins: [],
};

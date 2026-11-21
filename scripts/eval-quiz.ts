// 問題の質を確かめる評価スクリプト（T03）。
//
//   npm run eval                       … eval/images/ の画像で、すべてのモード×モデルを評価
//   npm run eval -- --modes=quiz --models=gemini-3.5-flash-lite
//   npm run eval -- --judge=gemini-3.5-flash --repeat=2
//
// 流れ: 画像 → 学習内容の書き出し（アプリの高速リトライONと同じ2フェーズ） → 12問作る
//       → アプリと同じ検証（quizValidation）で捨てた数を数える → 残った問題を別のAIが観点ごとに採点
// 結果は eval/results/ に Markdown（表）と JSON で残す。APIキーは .env.local の GEMINI_API_KEY を使う。

import { GoogleGenAI } from '@google/genai';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { GameMode, TeacherType, TOTAL_QUESTIONS } from '../types';
import { FALLBACK_MODELS, Type } from '../services/aiModels';
import { GENERATION_COUNT, analysisSchema, buildAnalysisPrompt, buildQuizPrompt, buildQuizSchema } from '../services/quizPrompts';
import { sanitizeQuestions, reconcileAnswer, isPlayableQuestion, refersToMaterial, copiesOriginal, revealsAnswer } from '../services/quizValidation';

// ---------- 設定 ----------
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));

const MODES = {
  'study-sunao': { mode: GameMode.STUDY, teacher: TeacherType.SUNAO },
  'study-amano': { mode: GameMode.STUDY, teacher: TeacherType.AMANO },
  quiz: { mode: GameMode.QUIZ, teacher: TeacherType.SUNAO },
} as const;
type ModeKey = keyof typeof MODES;

const modeKeys = (args.modes ? String(args.modes).split(',') : Object.keys(MODES)) as ModeKey[];
const models = args.models ? String(args.models).split(',') : FALLBACK_MODELS.filter(m => m !== 'gemini-2.5-flash-lite');
const judgeModel = String(args.judge ?? 'gemini-3.5-flash');
const repeat = Math.max(1, Number(args.repeat ?? 1));
const imageDir = String(args.images ?? 'eval/images');
const outDir = 'eval/results';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY がありません。.env.local に書いてください。');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000 } });

const thinkingFor = (model: string): Record<string, any> =>
  /gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : { thinkingConfig: { thinkingBudget: 0 } };

// ---------- 画像 ----------
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
let imageFiles: string[] = [];
try {
  imageFiles = readdirSync(imageDir).filter(f => MIME[extname(f).toLowerCase()]).sort();
} catch {
  // フォルダがない
}
if (imageFiles.length === 0) {
  console.error(`${imageDir}/ に画像（jpg/png/webp）がありません。代表的な教材の写真を10〜20枚置いてください。`);
  process.exit(1);
}
const imageParts = imageFiles.map(f => {
  const path = join(imageDir, f);
  if (statSync(path).size > 7_000_000) console.warn(`⚠ ${f} は大きい（7MB超）。縮小すると速くなります`);
  return { inlineData: { data: readFileSync(path).toString('base64'), mimeType: MIME[extname(f).toLowerCase()] } };
});
// アプリは1回に最大20枚送る
const BATCH = 20;
const batches: number[][] = [];
for (let i = 0; i < imageParts.length; i += BATCH) batches.push(imageParts.slice(i, i + BATCH).map((_, j) => i + j));

// ---------- 採点 ----------
const CHECKS = {
  answerCorrect: '正解とされている選択肢が本当に正しい',
  uniqueAnswer: '正しい選択肢がちょうど1つ（ほかの3つははっきりまちがい）',
  selfContained: '教材や画像を見なくても、問題文と選択肢だけで解ける',
  noTypos: '選択肢・問題文に誤字や、実在しない言葉の書きまちがいがない（表記を問う問題のわざとの誤字は除く）',
  naturalJapanese: '問題文が自然な日本語で、言い過ぎ（「すぐに」「必ず」など教科書にない強調）がない',
  notCopied: '（あまの先生のみ）教材の問題をそのまま写していない。それ以外のモードは常に true',
} as const;
type CheckKey = keyof typeof CHECKS;

const judgeSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER },
      ...Object.fromEntries(Object.keys(CHECKS).map(k => [k, { type: 'BOOLEAN' }])),
      comment: { type: Type.STRING, description: 'false がある場合、どこが問題かを短く' },
    },
    required: ['index', ...Object.keys(CHECKS), 'comment'],
  },
};

const judge = async (questions: any[], material: string, modeKey: ModeKey) => {
  const list = questions.map((q, i) =>
    `[${i}] 問題: ${q.question}\n    選択肢: ${q.options.map((o: string, j: number) => `${'ABCD'[j]}) ${o}`).join(' / ')}\n    正解: ${'ABCD'[q.correctAnswerIndex]}) ${q.options[q.correctAnswerIndex]}\n    解説: ${q.explanation}`,
  ).join('\n');
  const prompt = `あなたは小中学生向け教材の編集者です。AIが作った4択クイズを、次の観点で1問ずつ厳しく点検してください。
${Object.entries(CHECKS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
モード: ${modeKey}

===== 元の教材から書き出した内容（参考） =====
${material}
===== クイズ =====
${list}

1問につき1要素のJSON配列で返してください（index は上の番号）。`;
  const res = await ai.models.generateContent({
    model: judgeModel,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: judgeSchema as any },
  });
  return JSON.parse(res.text || '[]') as ({ index: number; comment: string } & Record<CheckKey, boolean>)[];
};

// ---------- 実行 ----------
interface RunResult {
  modeKey: ModeKey;
  model: string;
  round: number;
  batch: number;
  ms: number;
  generated: number;
  dropped: Record<string, number>;
  kept: number;
  judged: { question: string; options: string[]; correct: string; checks: Record<CheckKey, boolean>; comment: string }[];
  error?: string;
}

const countDrops = (raw: any[]) => {
  const drops = { notPlayable: 0, materialRef: 0, copied: 0, revealsAnswer: 0, duplicateOrExtra: 0 };
  const reconciled = raw.map(reconcileAnswer);
  for (const q of reconciled) {
    if (!q || !isPlayableQuestion(q)) drops.notPlayable++;
    else if (refersToMaterial(q)) drops.materialRef++;
    else if (copiesOriginal(q)) drops.copied++;
    else if (revealsAnswer(q)) drops.revealsAnswer++;
  }
  const kept = sanitizeQuestions(raw, GENERATION_COUNT).length;
  drops.duplicateOrExtra = raw.length - kept - drops.notPlayable - drops.materialRef - drops.copied - drops.revealsAnswer;
  return { drops, kept };
};

const results: RunResult[] = [];
for (let round = 1; round <= repeat; round++) {
  for (const model of models) {
    // 学習内容の書き出しはモデルごとに1回（モードは関係ない）
    const analyses: string[][] = [];
    for (const batch of batches) {
      const res = await ai.models.generateContent({
        model,
        contents: { parts: [...batch.map(i => imageParts[i]), { text: buildAnalysisPrompt(batch.length) }] },
        config: { responseMimeType: 'application/json', responseSchema: analysisSchema as any, ...thinkingFor(model) },
      });
      const data = JSON.parse(res.text || '[]');
      analyses.push(batch.map((_, pos) => `教材の種類: ${data[pos]?.materialType ?? '?'}\n${data[pos]?.summary ?? ''}`));
    }

    for (const modeKey of modeKeys) {
      const { mode, teacher } = MODES[modeKey];
      for (let b = 0; b < batches.length; b++) {
        const label = `${model} / ${modeKey} / ${round}回目 / 画像${batches[b][0] + 1}〜${batches[b][batches[b].length - 1] + 1}`;
        process.stdout.write(`${label} ... `);
        const started = Date.now();
        const material = analyses[b].map((a, pos) => `[元ネタ${pos}]\n${a}`).join('\n\n');
        try {
          const contents = `${buildQuizPrompt(mode, teacher)}\n\n===== 画像の解析結果（元ネタ） =====\n${material}\n===== ここまで =====\n\n上の指示に従って${GENERATION_COUNT}問を作成してください。`;
          const res = await ai.models.generateContent({
            model,
            contents,
            config: { responseMimeType: 'application/json', responseSchema: buildQuizSchema(mode, teacher) as any, ...thinkingFor(model) },
          });
          const raw = JSON.parse(res.text || '[]');
          const ms = Date.now() - started;
          const { drops, kept } = countDrops(Array.isArray(raw) ? raw : []);
          const playable = sanitizeQuestions(raw, TOTAL_QUESTIONS);
          const verdicts = await judge(playable, material, modeKey);
          results.push({
            modeKey, model, round, batch: b, ms,
            generated: Array.isArray(raw) ? raw.length : 0,
            dropped: drops, kept,
            judged: playable.map((q, i) => {
              const v = verdicts.find(x => x.index === i);
              return {
                question: q.question,
                options: q.options,
                correct: q.options[q.correctAnswerIndex],
                checks: Object.fromEntries(Object.keys(CHECKS).map(k => [k, v ? !!v[k as CheckKey] : false])) as Record<CheckKey, boolean>,
                comment: v?.comment ?? '（採点なし）',
              };
            }),
          });
          console.log(`${(ms / 1000).toFixed(1)}秒 / 使える問題 ${kept}/${GENERATION_COUNT}`);
        } catch (e) {
          console.log(`失敗: ${(e as Error).message}`);
          results.push({ modeKey, model, round, batch: b, ms: Date.now() - started, generated: 0, dropped: {}, kept: 0, judged: [], error: String((e as Error).message) });
        }
      }
    }
  }
}

// ---------- 集計・保存 ----------
const pct = (n: number, d: number) => (d === 0 ? '-' : `${Math.round((n / d) * 100)}%`);
const groups = new Map<string, RunResult[]>();
for (const r of results) {
  const key = `${r.model}|${r.modeKey}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}

const checkKeys = Object.keys(CHECKS) as CheckKey[];
const header = ['モデル', 'モード', '平均秒', '使える問題/12', ...checkKeys, 'すべて合格'];
const rows = [...groups.entries()].map(([key, rs]) => {
  const [model, modeKey] = key.split('|');
  const judged = rs.flatMap(r => r.judged);
  const ok = rs.filter(r => !r.error);
  return [
    model,
    modeKey,
    ok.length ? (ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1) : '-',
    ok.length ? (ok.reduce((s, r) => s + r.kept, 0) / ok.length).toFixed(1) : '-',
    ...checkKeys.map(k => pct(judged.filter(j => j.checks[k]).length, judged.length)),
    pct(judged.filter(j => checkKeys.every(k => j.checks[k])).length, judged.length),
  ];
});

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const failures = results.flatMap(r => r.judged
  .filter(j => !checkKeys.every(k => j.checks[k]))
  .map(j => `- **${r.model} / ${r.modeKey}**: ${j.question}（正解: ${j.correct}）\n  - ${checkKeys.filter(k => !j.checks[k]).join(', ')}: ${j.comment}`));

const md = `# 問題の質の評価 ${stamp}

- 画像: ${imageFiles.length}枚（${imageDir}）
- 採点モデル: ${judgeModel}
- 回数: ${repeat}

## 集計

| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}

観点: ${checkKeys.map(k => `\`${k}\` ${CHECKS[k]}`).join(' / ')}

## 捨てた問題の内訳（合計）

${[...groups.entries()].map(([key, rs]) => {
  const sum: Record<string, number> = {};
  rs.forEach(r => Object.entries(r.dropped).forEach(([k, v]) => { sum[k] = (sum[k] ?? 0) + v; }));
  return `- ${key.replace('|', ' / ')}: ${Object.entries(sum).map(([k, v]) => `${k} ${v}`).join('、') || '-'}`;
}).join('\n')}

## 不合格だった問題

${failures.join('\n') || 'なし'}

${results.some(r => r.error) ? `## 失敗した実行\n\n${results.filter(r => r.error).map(r => `- ${r.model} / ${r.modeKey}: ${r.error}`).join('\n')}\n` : ''}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${stamp}.md`), md);
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ stamp, judgeModel, images: imageFiles, results }, null, 2));
console.log(`\n結果: ${join(outDir, `${stamp}.md`)}`);

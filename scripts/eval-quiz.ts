// 問題の質を確かめる評価スクリプト（T03）。
//
//   npm run eval                       … eval/images/ の画像で、すべてのモード×モデルを評価
//   npm run eval -- --modes=quiz --models=gemini-3.5-flash-lite
//   npm run eval -- --judge=gemini-3.5-flash --repeat=2
//   npm run eval -- --checker=gemini-2.5-flash   … 答え合わせ（解き直し）のモデル。--checker=none で答え合わせをしない
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
import { sanitizeQuestions, reconcileAnswer, isPlayableQuestion, refersToMaterial, copiesOriginal, revealsAnswer, violatesCondition, hasLookalikeOption, stripMaterialMention, questionKind, pickVaried } from '../services/quizValidation';
import { answerCheckSchema, buildAnswerCheckPrompt, parseAnswerVerdicts, answerCheckProblem } from '../services/answerCheck';

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
// アプリの答え合わせ（geminiService の CHECK_MODELS の先頭）と同じモデル
const checkerModel = String(args.checker ?? 'gemini-3.5-flash-lite');
const imageDir = String(args.images ?? 'eval/images');
const outDir = 'eval/results';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY がありません。.env.local に書いてください。');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000 } });

// 混雑（503）・上限（429）・通信失敗のときは待って再試行する。秒数は成功した1回だけを数える
const generate = async (params: any): Promise<{ res: any; ms: number }> => {
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const res = await ai.models.generateContent(params);
      return { res, ms: Date.now() - started };
    } catch (e) {
      const msg = String((e as Error).message);
      // 1日の上限（無料枠など）は待っても戻らないので、すぐにやめる
      if (/PerDay|per day/i.test(msg)) throw e;
      if (attempt >= 8 || !/503|504|429|500|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|INTERNAL|fetch failed/i.test(msg)) throw e;
      const wait = 15_000 * attempt;
      process.stdout.write(`（混雑のため${wait / 1000}秒待って再試行） `);
      await new Promise(r => setTimeout(r, wait));
    }
  }
};

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
  noTypos: '選択肢・問題文に誤字や、実在しない言葉の書きまちがいがない（表記を問う問題のわざとの誤字と、「〜を使った熟語はどれ？」などで不正解をわざと実在しない言葉にしたものは除く）',
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
  const { res } = await generate({
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
  /** 答え合わせにかかった秒数（ミリ秒） */
  checkMs: number;
  generated: number;
  dropped: Record<string, number>;
  kept: number;
  /** 答え合わせの前の問題（予備を含む）すべてを採点する。final は答え合わせのあとで出題に選ばれた10問 */
  judged: { question: string; options: string[]; correct: string; kind: string; checks: Record<CheckKey, boolean>; comment: string; checkProblem: string | null; checkNote: string; final: boolean }[];
  /** 答え合わせができたか（失敗したときはアプリと同じく、確かめずに出題する） */
  checked: boolean;
  /** コードの検証で捨てた問題（形が壊れたものは除く）。どの問題がなぜ捨てられたかを見るため */
  droppedQuestions: { reason: string; question: string; options: string[]; correct: string }[];
  error?: string;
}

const countDrops = (raw: any[]) => {
  const drops = { notPlayable: 0, materialRef: 0, copied: 0, revealsAnswer: 0, conditionMismatch: 0, lookalike: 0, duplicateOrExtra: 0 };
  const droppedQuestions: RunResult['droppedQuestions'] = [];
  const reconciled = raw.map(reconcileAnswer).map(stripMaterialMention);
  for (const q of reconciled) {
    let reason: keyof typeof drops | null = null;
    if (!q || !isPlayableQuestion(q)) drops.notPlayable++;
    else if (refersToMaterial(q)) reason = 'materialRef';
    else if (copiesOriginal(q)) reason = 'copied';
    else if (revealsAnswer(q)) reason = 'revealsAnswer';
    else if (violatesCondition(q)) reason = 'conditionMismatch';
    else if (hasLookalikeOption(q)) reason = 'lookalike';
    if (reason) {
      drops[reason]++;
      droppedQuestions.push({ reason, question: q.question, options: q.options, correct: q.options[q.correctAnswerIndex] });
    }
  }
  const kept = sanitizeQuestions(raw, GENERATION_COUNT).length;
  drops.duplicateOrExtra = raw.length - kept - drops.notPlayable - drops.materialRef - drops.copied - drops.revealsAnswer - drops.conditionMismatch - drops.lookalike;
  return { drops, kept, droppedQuestions };
};

const results: RunResult[] = [];
// 1日の上限に当たったら、その先は全部失敗するので打ち切り、それまでの結果だけ保存する
let stoppedBy = '';
const isDailyLimit = (e: unknown) => /PerDay|per day/i.test(String((e as Error)?.message ?? e));
const quotaModel = (e: unknown) => String((e as Error)?.message ?? e).match(/model: ([\w.-]+)/)?.[1] ?? '?';
rounds: for (let round = 1; round <= repeat; round++) {
  for (const model of models) {
    // 学習内容の書き出しはモデルごとに1回（モードは関係ない）
    const analyses: string[][] = [];
    try {
      for (const batch of batches) {
        const { res } = await generate({
          model,
          contents: { parts: [...batch.map(i => imageParts[i]), { text: buildAnalysisPrompt(batch.length) }] },
          config: { responseMimeType: 'application/json', responseSchema: analysisSchema as any, ...thinkingFor(model) },
        });
        const data = JSON.parse(res.text || '[]');
        analyses.push(batch.map((_, pos) => `教材の種類: ${data[pos]?.materialType ?? '?'}\n${data[pos]?.summary ?? ''}`));
      }
    } catch (e) {
      if (isDailyLimit(e)) {
        stoppedBy = `${round}回目の ${model} の書き出しで、${quotaModel(e)} の1日の上限に当たった`;
        break rounds;
      }
      console.log(`${model} / ${round}回目: 書き出しに失敗したので飛ばす: ${(e as Error).message.slice(0, 120)}`);
      continue;
    }

    for (const modeKey of modeKeys) {
      const { mode, teacher } = MODES[modeKey];
      for (let b = 0; b < batches.length; b++) {
        const label = `${model} / ${modeKey} / ${round}回目 / 画像${batches[b][0] + 1}〜${batches[b][batches[b].length - 1] + 1}`;
        process.stdout.write(`${label} ... `);
        const material = analyses[b].map((a, pos) => `[元ネタ${pos}]\n${a}`).join('\n\n');
        try {
          const contents = `${buildQuizPrompt(mode, teacher)}\n\n===== 画像の解析結果（元ネタ） =====\n${material}\n===== ここまで =====\n\n上の指示に従って${GENERATION_COUNT}問を作成してください。`;
          const { res, ms } = await generate({
            model,
            contents,
            config: { responseMimeType: 'application/json', responseSchema: buildQuizSchema(mode, teacher) as any, ...thinkingFor(model) },
          });
          const raw = JSON.parse(res.text || '[]');
          const { drops, kept, droppedQuestions } = countDrops(Array.isArray(raw) ? raw : []);
          const candidates = sanitizeQuestions(raw, GENERATION_COUNT);
          // アプリと同じ答え合わせ。失敗したら確かめずに出題する（アプリと同じ）
          let checkVerdicts: ReturnType<typeof parseAnswerVerdicts> = null;
          let checkMs = 0;
          if (checkerModel !== 'none' && candidates.length >= TOTAL_QUESTIONS) {
            try {
              const { res: cres, ms: cms } = await generate({
                model: checkerModel,
                contents: buildAnswerCheckPrompt(candidates, material),
                config: { responseMimeType: 'application/json', responseSchema: answerCheckSchema as any, ...thinkingFor(checkerModel) },
              });
              checkVerdicts = parseAnswerVerdicts(JSON.parse(cres.text || '[]'));
              checkMs = cms;
            } catch (e) {
              process.stdout.write(`（答え合わせ失敗: ${(e as Error).message.slice(0, 80)}） `);
            }
          }
          const problems = candidates.map((q, i) => (checkVerdicts ? answerCheckProblem(q, checkVerdicts.find(v => v.index === i)) : null));
          const finalSet = new Set(pickVaried(candidates.filter((_, i) => !problems[i]), TOTAL_QUESTIONS));
          const verdicts = await judge(candidates, material, modeKey);
          results.push({
            modeKey, model, round, batch: b, ms, checkMs,
            generated: Array.isArray(raw) ? raw.length : 0,
            dropped: drops, kept: candidates.filter((_, i) => !problems[i]).length, droppedQuestions,
            checked: checkVerdicts !== null,
            judged: candidates.map((q, i) => {
              const v = verdicts.find(x => x.index === i);
              return {
                checkProblem: problems[i],
                checkNote: checkVerdicts?.find(x => x.index === i)?.check ?? '',
                final: finalSet.has(q),
                question: q.question,
                options: q.options,
                correct: q.options[q.correctAnswerIndex],
                kind: questionKind(q),
                checks: Object.fromEntries(Object.keys(CHECKS).map(k => [k, v ? !!v[k as CheckKey] : false])) as Record<CheckKey, boolean>,
                comment: v?.comment ?? '（採点なし）',
              };
            }),
          });
          console.log(`${(ms / 1000).toFixed(1)}秒＋答え合わせ${(checkMs / 1000).toFixed(1)}秒 / コードの検証後 ${kept}/${GENERATION_COUNT} / 答え合わせ後 ${problems.filter(p => !p).length}${checkVerdicts ? '' : '（答え合わせなし）'}`);
        } catch (e) {
          if (isDailyLimit(e)) {
            console.log(`1日の上限（${quotaModel(e)}）`);
            stoppedBy = `${label} で、${quotaModel(e)} の1日の上限に当たった`;
            break rounds;
          }
          console.log(`失敗: ${(e as Error).message}`);
          results.push({ modeKey, model, round, batch: b, ms: 0, checkMs: 0, generated: 0, dropped: {}, kept: 0, judged: [], droppedQuestions: [], checked: false, error: String((e as Error).message) });
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
// 同じ型の問題の多さ: 1回のクイズ（10問）で、いちばん多い問い方（読み・書き・意味・英語・計算）が何問あったか。
// 問題が1問も残らなかった回は平均に入れない（0% として数えると低く見えるため）
const kindCounts = (judged: { kind: string }[]) => {
  const counts: Record<string, number> = {};
  judged.forEach(j => { counts[j.kind] = (counts[j.kind] ?? 0) + 1; });
  return counts;
};
const topKindShare = (judged: { kind: string }[]) => {
  const n = Math.max(0, ...Object.entries(kindCounts(judged)).filter(([k]) => k !== 'その他').map(([, v]) => v));
  return judged.length ? n / judged.length : 0;
};
// 答え合わせの効き目: 採点AIが答えまわり（answerCorrect・uniqueAnswer・noTypos）で不合格とした問題を、答え合わせで捨てられたか
const ANSWER_KEYS: CheckKey[] = ['answerCorrect', 'uniqueAnswer', 'noTypos'];
const answerBad = (j: { checks: Record<CheckKey, boolean> }) => ANSWER_KEYS.some(k => !j.checks[k]);
const header = ['モデル', 'モード', '平均秒（作問＋答え合わせ）', '答え合わせ後の問題/12', ...checkKeys, 'すべて合格（出題10問）', 'すべて合格（答え合わせ前の全問）', '答えの誤り→捨てた', '正しい問題→捨てた', '同じ型の最大割合'];
const rows = [...groups.entries()].map(([key, rs]) => {
  const [model, modeKey] = key.split('|');
  const all = rs.flatMap(r => r.judged);
  const judged = all.filter(j => j.final);
  const ok = rs.filter(r => !r.error);
  const checkedAll = rs.filter(r => r.checked).flatMap(r => r.judged);
  const bad = checkedAll.filter(answerBad);
  const good = checkedAll.filter(j => !answerBad(j));
  return [
    model,
    modeKey,
    ok.length ? `${(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1)}＋${(ok.reduce((s, r) => s + r.checkMs, 0) / ok.length / 1000).toFixed(1)}` : '-',
    ok.length ? (ok.reduce((s, r) => s + r.kept, 0) / ok.length).toFixed(1) : '-',
    ...checkKeys.map(k => pct(judged.filter(j => j.checks[k]).length, judged.length)),
    pct(judged.filter(j => checkKeys.every(k => j.checks[k])).length, judged.length),
    pct(all.filter(j => checkKeys.every(k => j.checks[k])).length, all.length),
    `${bad.filter(j => j.checkProblem).length}/${bad.length}`,
    `${good.filter(j => j.checkProblem).length}/${good.length}`,
    (() => { const withQ = ok.filter(r => r.judged.some(j => j.final)); return withQ.length ? `${Math.round((withQ.reduce((s, r) => s + topKindShare(r.judged.filter(j => j.final)), 0) / withQ.length) * 100)}%` : '-'; })(),
  ];
});

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const failures = results.flatMap(r => r.judged
  .filter(j => !checkKeys.every(k => j.checks[k]))
  .map(j => `- **${r.model} / ${r.modeKey}**${j.checkProblem ? ` 〔答え合わせで捨てた: ${j.checkProblem}〕` : j.final ? '' : '（予備・出題せず）'}: ${j.question}（正解: ${j.correct} / 選択肢: ${j.options.join('・')}）\n  - ${checkKeys.filter(k => !j.checks[k]).join(', ')}: ${j.comment}`));
// 採点では合格なのに答え合わせで捨てた問題（捨てすぎの確認用）
const overDropped = results.flatMap(r => r.judged
  .filter(j => j.checkProblem && !answerBad(j))
  .map(j => `- **${r.model} / ${r.modeKey}** [${j.checkProblem}]: ${j.question}（正解: ${j.correct} / 選択肢: ${j.options.join('・')}）\n  - 答え合わせ: ${j.checkNote}`));

const md = `# 問題の質の評価 ${stamp}

- 画像: ${imageFiles.length}枚（${imageDir}）
- 採点モデル: ${judgeModel}
- 答え合わせのモデル: ${checkerModel}
- 回数: ${repeat}${stoppedBy ? `\n- **途中で打ち切った**: ${stoppedBy}。それまでの結果だけを集計した` : ''}

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

## 問い方の内訳（合計）

${[...groups.entries()].map(([key, rs]) => `- ${key.replace('|', ' / ')}: ${Object.entries(kindCounts(rs.flatMap(r => r.judged))).map(([k, v]) => `${k} ${v}`).join('、') || '-'}`).join('\n')}

## コードの検証で捨てた問題

${results.flatMap(r => r.droppedQuestions.map(d => `- **${r.model} / ${r.modeKey}** [${d.reason}]: ${d.question}（正解: ${d.correct}）`)).join('\n') || 'なし'}

## 採点では合格なのに答え合わせで捨てた問題

${overDropped.join('\n') || 'なし'}

## 不合格だった問題（答え合わせ前の予備も含む）

${failures.join('\n') || 'なし'}

${results.some(r => r.error) ? `## 失敗した実行\n\n${results.filter(r => r.error).map(r => `- ${r.model} / ${r.modeKey}: ${r.error}`).join('\n')}\n` : ''}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${stamp}.md`), md);
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ stamp, judgeModel, checkerModel, images: imageFiles, stoppedBy, results }, null, 2));
console.log(`\n結果: ${join(outDir, `${stamp}.md`)}`);

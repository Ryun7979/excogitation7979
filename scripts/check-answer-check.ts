// 答え合わせ（services/answerCheck.ts）が、まちがいの分かっている問題をどれだけ見つけられるかを確かめる。
// 採点AIを使わないので、無料枠の上限が小さいモデルを使わずに回せる。
//
//   node --env-file-if-exists=.env.local --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/ts-resolve-hook.mjs scripts/check-answer-check.ts --models=gemini-3.5-flash-lite --thinking=MINIMAL,LOW --repeat=2

import { GoogleGenAI } from '@google/genai';
import { answerCheckSchema, buildAnswerCheckPrompt, parseAnswerVerdicts, answerCheckProblem } from '../services/answerCheck';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));
const models = String(args.models ?? 'gemini-3.5-flash-lite').split(',');
const levels = String(args.thinking ?? 'MINIMAL').split(',');
const repeat = Math.max(1, Number(args.repeat ?? 1));

// bad: true はまちがいのある問題（捨てるべき）、false は正しい問題（残すべき）
const CASES = [
  { bad: true, question: 'ヨウ素液をつけると青むらさき色に変わるものはどれ？', options: ['てんぷん', 'しお', 'さとう', 'あぶら'], correctAnswerIndex: 0 },
  { bad: true, question: '文の（　）に入る言葉として最も適切なものはどれ？「まわりのようすをよく見て（　）を受ける。」', options: ['不利益', '大満足', '大成功', '大金持ち'], correctAnswerIndex: 0 },
  { bad: true, question: '『海』という漢字を使っていて、船が出入りする場所を表す言葉は？', options: ['漁港', '山道', '森林', '空港'], correctAnswerIndex: 0 },
  { bad: true, question: '植物の葉に日光が当たると作られる養分はどれ？', options: ['でんぷん', 'たんぱく質', 'しぼう', 'ビタミン'], correctAnswerIndex: 1 },
  { bad: true, question: '次のうち、こん虫はどれ？', options: ['バッタ', 'カブトムシ', 'クモ', 'ダンゴムシ'], correctAnswerIndex: 0 },
  { bad: true, question: '「災」の部首はどれ？', options: ['川（かわ）', '火（ひ）', '口（くち）', '田（た）'], correctAnswerIndex: 0 },
  { bad: true, question: '「魚市場」の読み方はどれ？', options: ['うしいちば', 'さかないちば', 'ぎょしじょう', 'うおば'], correctAnswerIndex: 0 },
  { bad: true, question: '人が息をはくとき、はく空気に、すう空気より多くふくまれている気体はどれ？', options: ['酸素', 'ちっ素', '二酸化炭素', '水素'], correctAnswerIndex: 0 },
  { bad: true, question: '36 − 19 はいくつ？', options: ['17', '27', '15', '23'], correctAnswerIndex: 1 },
  { bad: true, question: 'ヒント1: 火へんの漢字。ヒント2: わざわいという意味。ヒント3: 「さい」と読む。この漢字はどれ？', options: ['災', '炎', '灯', '畑'], correctAnswerIndex: 0 },
  { bad: false, question: 'ヨウ素液をつけると青むらさき色に変わるものはどれ？', options: ['でんぷん', 'しお', 'さとう', 'あぶら'], correctAnswerIndex: 0 },
  { bad: false, question: '人が息をはくとき、はく空気に、すう空気より多くふくまれている気体はどれ？', options: ['酸素', 'ちっ素', '二酸化炭素', '水素'], correctAnswerIndex: 2 },
  { bad: false, question: '「災害」の読み方はどれ？', options: ['さいがい', 'さいかい', 'かさい', 'ざいがい'], correctAnswerIndex: 0 },
  { bad: false, question: '「かこむ」を漢字と送りがなで書くとどれ？', options: ['囲む', '囲こむ', '囲かむ', '困む'], correctAnswerIndex: 0 },
  { bad: false, question: '36 − 19 はいくつ？', options: ['17', '27', '15', '23'], correctAnswerIndex: 0 },
  { bad: false, question: '『港』という漢字を使っていて、船が出入りする場所を表す言葉は？', options: ['漁港', '山道', '森林', '公園'], correctAnswerIndex: 0 },
  { bad: false, question: '次のうち、こん虫はどれ？', options: ['バッタ', 'クモ', 'ダンゴムシ', 'ムカデ'], correctAnswerIndex: 0 },
  { bad: false, question: '「税」を使った言葉はどれ？', options: ['税金', '説明', '脱出', '鋭角'], correctAnswerIndex: 0 },
  { bad: false, question: '植物が光を受けて養分を作るはたらきを何という？', options: ['光合成', '呼吸', '蒸散', '消化'], correctAnswerIndex: 0 },
  { bad: false, question: '「適切」の意味として正しいものはどれ？', options: ['よく当てはまっていること', 'とても大きいこと', 'すぐに終わること', 'よごれていること'], correctAnswerIndex: 0 },
];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 120_000 } });
const thinking = (model: string, level: string): Record<string, any> =>
  /gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: level } } : { thinkingConfig: { thinkingBudget: level === 'MINIMAL' ? 0 : 1024 } };

// 本番と同じく12問前後をまとめて渡す（10問ずつ2回）
const shuffled = [...CASES].sort(() => Math.random() - 0.5);
const chunks = [shuffled.slice(0, 10), shuffled.slice(10)];

for (const model of models) {
  for (const level of levels) {
    let caught = 0, overDropped = 0, ms = 0;
    const missed: string[] = [], over: string[] = [];
    for (let r = 0; r < repeat; r++) {
      for (const chunk of chunks) {
        let res: any;
        for (let attempt = 1; ; attempt++) {
          const started = Date.now();
          try {
            res = await ai.models.generateContent({
              model,
              contents: buildAnswerCheckPrompt(chunk),
              config: { responseMimeType: 'application/json', responseSchema: answerCheckSchema as any, ...thinking(model, level) },
            });
            ms += Date.now() - started;
            break;
          } catch (e) {
            // 混雑（503）・回数制限（429）は待って再試行する
            if (attempt >= 6 || !/503|429|UNAVAILABLE/.test(String((e as Error).message))) throw e;
            await new Promise(r => setTimeout(r, 15_000 * attempt));
          }
        }
        const verdicts = parseAnswerVerdicts(JSON.parse(res.text || '[]')) ?? [];
        chunk.forEach((c, i) => {
          const v = verdicts.find(x => x.index === i);
          const problem = answerCheckProblem(c, v);
          if (c.bad && problem) caught++;
          if (c.bad && !problem) missed.push(`${c.question}（${c.options[c.correctAnswerIndex]}）`);
          if (!c.bad && problem) { overDropped++; over.push(`${c.question} [${problem}] ${v?.check}`); }
        });
      }
    }
    const nBad = CASES.filter(c => c.bad).length * repeat;
    const nGood = CASES.filter(c => !c.bad).length * repeat;
    console.log(`\n## ${model} / 思考 ${level}: まちがいを捨てた ${caught}/${nBad}・正しい問題を捨てた ${overDropped}/${nGood}・1回あたり ${(ms / (repeat * chunks.length) / 1000).toFixed(1)}秒`);
    missed.forEach(m => console.log(`  見のがし: ${m}`));
    over.forEach(m => console.log(`  捨てすぎ: ${m}`));
  }
}

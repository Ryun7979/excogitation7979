// 作った問題の答え合わせ（AIによる解き直し）。
// 作問は軽量モデル＋思考最小の1回きりなので、「正しい選択肢が2つある」「正解とされた選択肢がまちがい」
// 「実在しない言葉（でんぷん→てんぷん）が選択肢にある」問題がまざる。コードの検証では見つけられないため、
// 正解を伏せた問題を別の呼び出しで解かせ、正しい選択肢が「つけた正解ちょうど1つ」でない問題を捨てる。
// 評価スクリプト（scripts/eval-quiz.ts）からも使う。

import { Type } from "./aiModels";

/** 答え合わせに渡す問題の形 */
export interface CheckableQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

export interface AnswerVerdict {
  index: number;
  /** 4つの選択肢を1つずつ判定したメモ（ログ・評価用） */
  check: string;
  /** 問いに対して正しい答えといえる選択肢の番号（0〜3）。2つ以上あってもよい */
  correctOptions: number[];
  /** 問題として成り立っていない（誤字・実在しない言葉・あいまい・意味が通らない）か */
  broken: boolean;
}

export const answerCheckSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER, description: "問題の番号" },
      conditions: { type: Type.STRING, description: "問題文が答えに求めている条件を1つ残らず書き出す（例: 『海』という漢字が入っている / 船が出入りする場所を表す / （　）に入れて自然な文になる / ヒント1〜3にすべて当てはまる）" },
      check: { type: Type.STRING, description: "A〜D の選択肢を1つずつ、conditions の条件ごとに○×をつけて判定する。1つでも×があれば、その選択肢はまちがい。実在する言葉・正しい表記かも見る（例: A 漁港: 『海』が入っている× 船の場所○ → まちがい）" },
      correctOptions: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER },
        description: "check で正しいと判定した選択肢の番号（A=0, B=1, C=2, D=3）。正しいものが2つ以上あればすべて入れる。1つもなければ空",
      },
      broken: { type: Type.BOOLEAN, description: "問題文や選択肢に誤字・実在しない言葉・意味の通らない文がある、または答えが1つに決まらないあいまいな問題なら true" },
    },
    required: ["index", "conditions", "check", "correctOptions", "broken"],
    propertyOrdering: ["index", "conditions", "check", "correctOptions", "broken"],
  },
};

/** 答え合わせの指示文。正解は伏せて渡す（作った側の答えに引っぱられないように） */
export const buildAnswerCheckPrompt = (questions: CheckableQuestion[], material?: string): string => {
  const list = questions.map((q, i) =>
    `[${i}] ${q.question}\n    ${q.options.map((o, j) => `${'ABCD'[j]}) ${o}`).join(' / ')}`,
  ).join('\n');
  return `あなたは小学生向けの問題集の校正係です。次の4択問題を、自分で1問ずつ解いて点検してください。
答えはまだ決まっていません。また、4つの中に正しい答えがあるとはかぎりません（作った人がまちがえていることがよくあります）。

点検のしかた:
- 4つの中で「いちばん近いもの」を選ぶのではない。選択肢を1つずつ問題文に当てはめ、それだけで正しい答えといえるかを判定する。
- まず conditions に、問題文が答えに求めている条件をすべて書き出す。「『X』を使った」「（　）に入る」「ヒント」「〜ではないもの」「いちばん〜」「ウソはどれ」なども条件。
- check で、選択肢ごとに条件を1つずつ○×で確かめる。1つでも×があれば、その選択肢はまちがい。
  - 「『X』を使った言葉」なら、その選択肢の字に X が本当に入っているかを1字ずつ見る。
  - 「（　）に入る言葉」なら、（　）に入れた文を書いて、自然な日本語として意味が通るかを確かめる。
  - ヒントや説明がある問題なら、ヒント・説明の1つ1つが事実として本当にその選択肢に当てはまるかを確かめる（部首・画数・読みなどの説明のまちがいにも注意）。
- 教科書・国語辞典・図鑑にのっている確かな事実で判定する。計算は自分で計算する。
- 正しいといえる選択肢が2つ以上あれば、すべて correctOptions に入れる。条件をすべて満たすものがなければ空にする。
- 選択肢や問題文に、誤字・実在しない言葉（例: 「でんぷん」を「てんぷん」と書く）・意味の通らない文があれば broken を true にする。
  ただし「正しい漢字（書き方・読み方）はどれ？」のように表記そのものを問う問題の、わざとまちがえた不正解と、
  「〜を使った熟語はどれ？」で不正解をわざと実在しない言葉にしたものは、誤字に数えない。
${material ? `
次は問題の元になった教材の内容です。教材に書いてある事実（人物・年・数値・言葉の使い方など）は、これを正しいものとして判定してください。
===== 教材の内容 =====
${material}
===== ここまで =====
` : ''}
===== 問題 =====
${list}
===== ここまで =====

1問につき1要素のJSON配列で、すべての問題を返してください（index は上の番号）。`;
};

/** 答え合わせの応答を読み取る。形が壊れていれば null（答え合わせをしなかったのと同じに扱う） */
export const parseAnswerVerdicts = (data: unknown): AnswerVerdict[] | null => {
  if (!Array.isArray(data)) return null;
  const verdicts = data.filter((v: any) =>
    v != null &&
    Number.isInteger(v.index) &&
    Array.isArray(v.correctOptions) &&
    v.correctOptions.every((n: unknown) => Number.isInteger(n)) &&
    typeof v.broken === 'boolean',
  ).map((v: any) => ({ index: v.index, check: String(v.check ?? ''), correctOptions: [...new Set<number>(v.correctOptions)], broken: v.broken }));
  return verdicts.length > 0 ? verdicts : null;
};

/** 捨てる理由（評価・ログ用）。捨てないなら null */
export const answerCheckProblem = (q: CheckableQuestion, v: AnswerVerdict | undefined): string | null => {
  // 答え合わせの応答にない問題は、確かめられなかっただけなので残す
  if (!v) return null;
  if (v.broken) return 'broken';
  if (v.correctOptions.length === 0) return 'noCorrect';
  if (v.correctOptions.length > 1) return 'multipleCorrect';
  if (v.correctOptions[0] !== q.correctAnswerIndex) return 'wrongAnswer';
  return null;
};

/** 答え合わせで問題がなかった問題だけを返す（順番は元のまま） */
export const applyAnswerCheck = <Q extends CheckableQuestion>(questions: Q[], verdicts: AnswerVerdict[]): Q[] =>
  questions.filter((q, i) => answerCheckProblem(q, verdicts.find(v => v.index === i)) === null);

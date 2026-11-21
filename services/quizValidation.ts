// AIの応答（JSON）から、ゲームで安全に出題できる問題だけを取り出す。
// スキーマ指定があってもモデルは問題数や選択肢数を守らないことがあり、
// そのまま使うと「10問目が存在しない」等で画面が落ちるため、ここで検証する。

import type { QuizQuestion } from "../types";

export const OPTION_COUNT = 4;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

// 空白や全角/半角の違いだけの選択肢も「同じ」とみなす
const normalizeOption = (o: string): string => o.normalize('NFKC').replace(/\s+/g, '');

/** 選択肢がすべて異なるか（AIが「利益・利益・公益・利益」のように重複させることがある） */
export const hasDistinctOptions = (options: string[]): boolean =>
  new Set(options.map(normalizeOption)).size === options.length;

/** 1問分が出題可能な形か（問題文・4つの異なる選択肢・正解インデックス） */
export const isPlayableQuestion = (q: any): boolean =>
  q != null &&
  typeof q === 'object' &&
  isNonEmptyString(q.question) &&
  Array.isArray(q.options) &&
  q.options.length === OPTION_COUNT &&
  q.options.every(isNonEmptyString) &&
  hasDistinctOptions(q.options) &&
  Number.isInteger(q.correctAnswerIndex) &&
  q.correctAnswerIndex >= 0 &&
  q.correctAnswerIndex < OPTION_COUNT;

// 元の教材そのものを指す言葉。子供は教材を見ずに遊ぶので、これを含む問題は捨てる。
// 「ネットワーク」「チームワーク」などは対象外にするため、カタカナに続く「ワーク」は除く
const MATERIAL_REFERENCE = /(?<![ァ-ヶー])ワーク|ドリル|教材|プリント|画像/;

/** 問題文が元の教材（ワーク・ドリル・画像など）を指しているか */
export const refersToMaterial = (q: any): boolean =>
  typeof q?.question === 'string' && MATERIAL_REFERENCE.test(q.question);

// 丸写し判定用の正規化: 全角/半角・空白・記号のゆれをなくす
const normalizeForCopy = (s: string): string =>
  s.normalize('NFKC').replace(/[\s=＝?？。、,.「」『』()（）□]/g, '').replace(/[x*]/g, '×');

/**
 * あまの先生の問題が、元画像の問題の丸写しになっていないか。
 * AIが先に書いた originalContent（元の問題・数値・語句）の各項目が、問題文にそのまま
 * 含まれていたら丸写しとみなす（例: 元「5+60」→ 問題「5 + 60 はいくつですか」）。
 * 誤判定で正しい問題を捨てないよう、計算式（7×4 など）か、8文字以上の項目だけを比べる。
 * 年号（1603年）や短い語句は、応用問題でも使うのが自然なので比べない（捨てすぎると問題が足りなくなる）
 */
export const copiesOriginal = (q: any): boolean => {
  if (typeof q?.originalContent !== 'string' || typeof q?.question !== 'string') return false;
  const question = normalizeForCopy(q.question);
  return q.originalContent
    .split(/[、,，/／\n;；]/)
    .map(normalizeForCopy)
    .filter((piece: string) => (piece.length >= 3 && /\d[+\-−×÷/]\d/.test(piece)) || piece.length >= 8)
    .some((piece: string) => question.includes(piece));
};

// 正解の手がかり判定用: 記号・空白をのぞいて比べる
const normalizeForHint = (s: string): string =>
  s.normalize('NFKC').replace(/[\s「」『』()（）、。,.!?！？・:：]/g, '');

const ANNOTATION = /[（(][^）)]*[）)]/;

/**
 * 選択肢の見た目から正解が分かってしまうか。プロンプトで禁止しているが守られないことがあるため、
 * 誤判定で正しい問題を捨てすぎないよう、はっきりしたものだけを見つける。
 * - 正解の選択肢にだけ（ふりがな・注釈）が付いている
 * - 正解だけが極端に長い（他のどれよりも2倍以上、かつ10文字以上長い）
 * - 正解の言葉（2文字以上）が問題文にそのまま書いてあり、不正解の言葉は書いていない
 */
export const revealsAnswer = (q: any): boolean => {
  const options: string[] = q.options;
  const correct = options[q.correctAnswerIndex];
  const others = options.filter((_, i) => i !== q.correctAnswerIndex);

  if (ANNOTATION.test(correct) && others.every(o => !ANNOTATION.test(o))) return true;

  const longestOther = Math.max(...others.map(o => o.length));
  if (correct.length >= longestOther * 2 && correct.length - longestOther >= 10) return true;

  const question = normalizeForHint(q.question);
  const inQuestion = (o: string) => {
    const n = normalizeForHint(o);
    return n.length >= 2 && question.includes(n);
  };
  if (inQuestion(correct) && !others.some(inQuestion)) return true;

  return false;
};

// ---------- 条件と正解が合わない問題（T12） ----------

// 「『海』という漢字を使って」「『海』が入る」「『海』のつく」など、正解に含まれるべき漢字の条件
const KANJI_CONDITION =
  /[『「]([一-鿿々]{1,4})[』」](?:という(?:漢字|字)|の(?:漢字|字))?(?:を|が|の)?(?:使|つか|ふく|含|入|はい|つく|付)/g;
// 「使わない」「〜ではない」「まちがっている」など、条件を満たさないものを選ばせる問題は対象外
const NEGATIVE_QUESTION = /ない|ず[、。にの]|ちが|違|誤|ウソ|うそ/;
// 正解が「言葉」でない問題（読み・意味・画数・部首など）は、正解に漢字が入らなくて当然なので対象外
const NOT_A_WORD_QUESTION = /意味|いみ|読|よみ|よむ|画数|何画|部首|へん|かんむり|つくり|反対|対義|類義|書き順|筆順/;
const HAS_KANJI = /[一-鿿々]/;

/**
 * 「『X』を使った言葉は？」型で、正解に X が入っていないか。
 * 例:「『海』という漢字を使っていて、船が出入りする場所は？（正解: 漁港）」
 * 誤判定で正しい問題を捨てないよう、否定の問い・読みや意味を問う問題・正解が短い言葉でない問題は見ない。
 */
export const violatesKanjiCondition = (q: any): boolean => {
  const question = q.question.normalize('NFKC');
  if (NEGATIVE_QUESTION.test(question) || NOT_A_WORD_QUESTION.test(question)) return false;
  const correct = String(q.options[q.correctAnswerIndex]).normalize('NFKC');
  if (correct.length > 10 || /[。、]/.test(correct) || !HAS_KANJI.test(correct)) return false;
  return [...question.matchAll(KANJI_CONDITION)].some(m => !correct.includes(m[1]));
};

// 計算式の読み取り: 全角・マイナス記号のゆれをそろえる
const toAsciiMath = (s: string): string =>
  s.normalize('NFKC').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');

/**
 * 四則演算の式（+ - * / とかっこ、小数）を計算する。式でなければ null。
 * eval は使わない（AIの出力をそのまま実行しないため）
 */
export const evaluateArithmetic = (raw: string): number | null => {
  const s = toAsciiMath(raw).replace(/\s+/g, '');
  if (!/^[\d.+\-*/()]+$/.test(s) || !/\d[+\-*/]\(?\d/.test(s)) return null;
  let pos = 0;
  const peek = () => s[pos];
  const number = (): number | null => {
    if (peek() === '(') {
      pos++;
      const v = expr();
      if (peek() !== ')') return null;
      pos++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return Number(m[0]);
  };
  const term = (): number | null => {
    let v = number();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = s[pos++];
      const r = number();
      if (r === null || (op === '/' && r === 0)) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = s[pos++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  return v !== null && pos === s.length && Number.isFinite(v) ? v : null;
};

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const parseNumber = (o: string): number | null => {
  const s = o.normalize('NFKC').replace(/[\s,]/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
};

// 「36 − 19 はいくつ？」のように、式だけを計算させる問題（文章題・□を求める問題は対象外）
const EXPR = String.raw`[\d(][\d\s.+\-*/()]*[\d)]`;
const DIRECT_CALC = new RegExp(
  String.raw`^(?:[^\d]*[。:]\s*)?(${EXPR})\s*(?:は|を計算すると|の答えは|の答え|=)?\s*(?:いくつ|何|なん|どれ)?\s*(?:ですか|でしょうか|でしょう|かな)?\s*[?]?$`,
);
// 「答えが 20 になる式はどれ？」（「ならない」は「なる」に当たらないので対象外）
const TARGET_CALC = /答えが\s*(-?\d+(?:\.\d+)?)\s*に\s*なる/;

/**
 * 計算の答えが合わないか。
 * - 「36 − 19 はいくつ？」で、正解の数が式の答えと違う（選択肢がすべて数のときだけ見る）
 * - 「答えが 20 になる式は？」で、正解の式が 20 にならない、または不正解の式にも 20 になるものがある
 */
export const violatesArithmetic = (q: any): boolean => {
  const question = toAsciiMath(q.question).trim();
  const options: string[] = q.options;
  const correctIndex: number = q.correctAnswerIndex;

  const direct = DIRECT_CALC.exec(question);
  if (direct) {
    const value = evaluateArithmetic(direct[1]);
    const numbers = options.map(parseNumber);
    if (value !== null && numbers.every(n => n !== null)) {
      return !sameNumber(numbers[correctIndex]!, value) ||
        numbers.filter(n => sameNumber(n!, value)).length !== 1;
    }
  }

  const target = TARGET_CALC.exec(question);
  if (target) {
    const goal = Number(target[1]);
    const values = options.map(evaluateArithmetic);
    if (values[correctIndex] !== null && !sameNumber(values[correctIndex]!, goal)) return true;
    if (values.some((v, i) => i !== correctIndex && v !== null && sameNumber(v, goal))) return true;
  }
  return false;
};

/** 問題文の条件（「『X』を使った」「答えが N になる」など）と正解が合わないか */
export const violatesCondition = (q: any): boolean => violatesKanjiCondition(q) || violatesArithmetic(q);

// ---------- 同じ型の問題が多い（T12） ----------

// 先に当てたものを優先する（「『よむ』を漢字で書くと？」は読みではなく書き）
const QUESTION_KINDS: [string, RegExp][] = [
  ['書き', /漢字で書|かんじで|書くと|書き方|正しい漢字|送りがな|おくりがな/],
  ['読み', /読み|よみ|読む|よむ|と読/],
  ['意味', /意味|いみ/],
  ['英語', /英語|英単語|[A-Za-z]{3,}/],
  ['計算', /\d\s*[+\-−×÷]\s*\d|計算/],
];

/** 問題の問い方の種類（読み・書き・意味・英語・計算）。どれにも当たらなければ 'その他' */
export const questionKind = (q: any): string =>
  QUESTION_KINDS.find(([, re]) => re.test(String(q?.question ?? '').normalize('NFKC')))?.[0] ?? 'その他';

/** 1回のクイズで、同じ問い方の問題をこの割合までにする（予備の問題があるときだけ） */
export const MAX_SAME_KIND_RATIO = 0.4;

/**
 * total 問より多くあるとき、同じ問い方が続きすぎないように選ぶ。
 * 同じ種類は total × MAX_SAME_KIND_RATIO 問までを先に選び、足りない分は残りから順に補う
 * （問題の数は減らさない。計算ドリルのように全部が計算でも、そのまま total 問になる）。
 * 'その他' はいろいろな問い方の集まりなので数えない。順番は元のまま。
 */
export const pickVaried = <Q>(list: Q[], total: number, kindOf: (q: Q) => string = questionKind): Q[] => {
  if (list.length <= total) return list;
  const cap = Math.ceil(total * MAX_SAME_KIND_RATIO);
  const counts = new Map<string, number>();
  const chosen = new Set<number>();
  list.forEach((q, i) => {
    if (chosen.size >= total) return;
    const kind = kindOf(q);
    const n = counts.get(kind) ?? 0;
    if (kind !== 'その他' && n >= cap) return;
    counts.set(kind, n + 1);
    chosen.add(i);
  });
  for (let i = 0; i < list.length && chosen.size < total; i++) chosen.add(i);
  return list.filter((_, i) => chosen.has(i));
};

/** 問題文の重複判定キー（空白・記号のゆれをなくす） */
const questionKey = (q: any): string => normalizeForHint(q.question);

/**
 * 同じ問題とみなすためのキー（正解＋選択肢の組）。
 * 「黄色を表す英単語は？」と「レモンの色を表す英単語は？」のように
 * 問題文の言い回しだけ違う重複も、正解と選択肢が同じなら同じ問題とみなす
 */
const duplicateKey = (q: any): string =>
  `${normalizeOption(q.options[q.correctAnswerIndex])}|${q.options.map(normalizeOption).sort().join('/')}`;

// 「すべて正しい」「上のどれでもない」など、選択肢の位置や他の選択肢に依存するもの。
// これを含む問題は並べ替えると意味が崩れるので、そのままにする
const POSITION_DEPENDENT_OPTION = /すべて|全部|ぜんぶ|どれも|いずれも|以上|上の|両方|りょうほう/;

/**
 * 選択肢をシャッフルし、正解インデックスを付け替える。
 * AIは正解を1番目・2番目に置きがちで、位置から答えが読めてしまうため。
 */
export const shuffleOptions = <Q extends { options: string[]; correctAnswerIndex: number }>(
  q: Q,
  random: () => number = Math.random
): Q => {
  if (q.options.some(o => POSITION_DEPENDENT_OPTION.test(o))) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map(i => q.options[i]),
    correctAnswerIndex: order.indexOf(q.correctAnswerIndex),
  };
};

/**
 * AIが先に書いた正解(answer)と選択肢を照合し、correctAnswerIndex を付け直す。
 * 軽量モデルは途中式で正しく 61+9=70 と出しても、正解番号では 69 を指すことがあるため。
 * answer が選択肢のどれとも一致しない問題は、正解がどれか確定できないので除外する（null を返す）。
 * answer が無い応答（古い形式など）はそのまま通す。
 */
export const reconcileAnswer = (q: any): any => {
  if (q == null || typeof q !== 'object' || !isNonEmptyString(q.answer) || !Array.isArray(q.options)) {
    return q;
  }
  const target = normalizeOption(q.answer);
  const index = q.options.findIndex((o: unknown) => typeof o === 'string' && normalizeOption(o) === target);
  if (index < 0) return null;
  return { ...q, correctAnswerIndex: index };
};

/**
 * 出題可能な問題だけを先頭から最大 total 問まで返す。
 * 解説が欠けていても出題はできるので空文字で補う。
 */
export const sanitizeQuestions = (
  data: unknown,
  total: number
): Omit<QuizQuestion, 'id'>[] => {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const seenQuestions = new Set<string>();
  const usable = data
    .map(reconcileAnswer)
    .filter(isPlayableQuestion)
    .filter(q => !refersToMaterial(q))
    .filter(q => !copiesOriginal(q))
    .filter(q => !revealsAnswer(q))
    .filter(q => !violatesCondition(q))
    .filter(q => {
      const key = duplicateKey(q);
      const qKey = questionKey(q);
      if (seen.has(key) || seenQuestions.has(qKey)) return false;
      seen.add(key);
      seenQuestions.add(qKey);
      return true;
    });
  return pickVaried(usable, total)
    .map((q: any) => ({
      ...q,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
    }));
};

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuestions, isPlayableQuestion, shuffleOptions, reconcileAnswer, refersToMaterial, copiesOriginal, revealsAnswer, violatesKanjiCondition, violatesArithmetic, evaluateArithmetic, questionKind, pickVaried } from './quizValidation.ts';

const valid = (n: number) => ({
  question: `問題${n}`,
  options: [`A${n}`, `B${n}`, `C${n}`, `D${n}`],
  correctAnswerIndex: n % 4,
  explanation: '解説',
  targetAge: '小学3年生',
  sourceImageIndex: 0,
});

test('正しい形の問題は出題可能', () => {
  assert.equal(isPlayableQuestion(valid(1)), true);
});

test('選択肢が4つでない問題は除外される', () => {
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['A', 'B', 'C'] }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['A', 'B', 'C', 'D', 'E'] }), false);
});

test('空の選択肢や問題文は除外される', () => {
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['A', '', 'C', 'D'] }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), question: '  ' }), false);
});

test('同じ選択肢が重複している問題は除外される', () => {
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['利益', '利益', '公益', '利益'] }), false);
  // 空白や全角・半角の違いだけでも重複とみなす
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['A', 'Ａ', 'C', 'D'] }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), options: ['小 皿', '小皿', 'C', 'D'] }), false);
});

test('reconcileAnswer: answer と一致する選択肢に正解番号を付け直す', () => {
  const q = { ...valid(1), options: ['69', '70', '68', '71'], correctAnswerIndex: 0, answer: '70' };
  assert.equal(reconcileAnswer(q).correctAnswerIndex, 1);
  // 全角・空白の違いは同じとみなす
  assert.equal(reconcileAnswer({ ...q, answer: '７０ ' }).correctAnswerIndex, 1);
});

test('reconcileAnswer: answer がどの選択肢とも一致しなければ除外される', () => {
  const q = { ...valid(1), options: ['69', '68', '67', '71'], answer: '70' };
  assert.equal(reconcileAnswer(q), null);
  assert.equal(sanitizeQuestions([q], 10).length, 0);
});

test('reconcileAnswer: answer が無ければそのまま', () => {
  const q = valid(2);
  assert.equal(reconcileAnswer(q), q);
});

test('教材そのものを指す問題は除外される', () => {
  const q = (question: string) => ({ ...valid(1), question });
  assert.equal(refersToMaterial(q('ワークに載っている動物のうち、なかまはずれはどれ？')), true);
  assert.equal(refersToMaterial(q('ドリルで練習する漢字はどれ？')), true);
  assert.equal(refersToMaterial(q('画像の3番は何？')), true);
  assert.equal(refersToMaterial(q('次の動物のうち、なかまはずれはどれ？')), false);
  // カタカナ語の一部としての「ワーク」は対象外
  assert.equal(refersToMaterial(q('チームワークの意味はどれ？')), false);
  assert.equal(sanitizeQuestions([q('教材に出てくる色はどれ？'), q('黄色はどれ？')], 10).length, 1);
});

test('正解と選択肢が同じ重複問題は1つだけ残る', () => {
  const a = { ...valid(1), question: '「黄色」を表す英単語は？', options: ['red', 'yellow', 'blue', 'green'], correctAnswerIndex: 1 };
  const b = { ...valid(2), question: 'レモンの色を表す英単語は？', options: ['green', 'blue', 'yellow', 'red'], correctAnswerIndex: 2 };
  const c = { ...valid(3), question: '「赤」を表す英単語は？', options: ['red', 'yellow', 'blue', 'green'], correctAnswerIndex: 0 };
  const out = sanitizeQuestions([a, b, c], 10);
  assert.deepEqual(out.map(q => q.question), [a.question, c.question]);
});

test('あまの先生: 元画像の問題の丸写しは除外される', () => {
  const q = (originalContent: string, question: string) => ({ ...valid(1), originalContent, question });
  assert.equal(copiesOriginal(q('5+60', '5 + 60 はいくつですか。')), true);
  assert.equal(copiesOriginal(q('16+4、33+7', '33＋7 はいくつ？')), true);
  assert.equal(copiesOriginal(q('7×4=', '7 x 4 はいくつ？')), true);
  // 数値を変えた応用問題は残す
  assert.equal(copiesOriginal(q('5+60', '7 + 80 はいくつですか。')), false);
  // 短い語句（「生」など）や年号は比べない
  assert.equal(copiesOriginal(q('生', '「生える」の読み方は？')), false);
  assert.equal(copiesOriginal(q('1603年、江戸幕府', '1603年に幕府を開いた人物は？')), false);
  // originalContent が無い（すなお先生・クイズモード）ならそのまま
  assert.equal(copiesOriginal(valid(1)), false);
});

test('正解インデックスが範囲外・非整数なら除外される', () => {
  assert.equal(isPlayableQuestion({ ...valid(1), correctAnswerIndex: 4 }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), correctAnswerIndex: -1 }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), correctAnswerIndex: 1.5 }), false);
  assert.equal(isPlayableQuestion({ ...valid(1), correctAnswerIndex: '1' }), false);
});

test('sanitizeQuestions: 多すぎる問題は先頭total問に切り詰める', () => {
  const data = Array.from({ length: 12 }, (_, i) => valid(i));
  const out = sanitizeQuestions(data, 10);
  assert.equal(out.length, 10);
  assert.equal(out[0].question, '問題0');
});

test('sanitizeQuestions: 不正な問題を飛ばして有効な問題だけ返す', () => {
  const data = [valid(0), { ...valid(1), options: [] }, null, 'x', valid(2)];
  const out = sanitizeQuestions(data, 10);
  assert.deepEqual(out.map(q => q.question), ['問題0', '問題2']);
});

test('sanitizeQuestions: 解説が欠けていたら空文字で補う', () => {
  const { explanation, ...noExp } = valid(0);
  const out = sanitizeQuestions([noExp], 10);
  assert.equal(out[0].explanation, '');
});

test('sanitizeQuestions: 配列以外なら空配列', () => {
  assert.deepEqual(sanitizeQuestions({}, 10), []);
  assert.deepEqual(sanitizeQuestions(null, 10), []);
});

test('shuffleOptions: 並べ替えても正解の選択肢は同じ', () => {
  const q = { ...valid(0), options: ['正解', 'B', 'C', 'D'], correctAnswerIndex: 0 };
  for (let seed = 0; seed < 20; seed++) {
    let x = seed;
    const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const out = shuffleOptions(q, rand);
    assert.equal(out.options[out.correctAnswerIndex], '正解');
    assert.deepEqual([...out.options].sort(), [...q.options].sort());
  }
});

test('shuffleOptions: 正解の位置がばらける', () => {
  const q = { ...valid(0), options: ['正解', 'B', 'C', 'D'], correctAnswerIndex: 0 };
  const positions = new Set(Array.from({ length: 200 }, () => shuffleOptions(q).correctAnswerIndex));
  assert.equal(positions.size, 4);
});

test('shuffleOptions: 「すべて」等を含む問題は並べ替えない', () => {
  const q = { ...valid(0), options: ['A', 'B', 'C', 'すべて正しい'], correctAnswerIndex: 3 };
  assert.deepEqual(shuffleOptions(q), q);
});

const q4 = (question: string, options: string[], correctAnswerIndex = 0) => ({ question, options, correctAnswerIndex });

test('revealsAnswer: 正解にだけ（ふりがな）が付いていたら答えが分かる', () => {
  assert.equal(revealsAnswer(q4('江戸幕府を開いた人は？', ['徳川家康（とくがわいえやす）', '織田信長', '豊臣秀吉', '源頼朝'])), true);
  assert.equal(revealsAnswer(q4('江戸幕府を開いた人は？', ['徳川家康（とくがわいえやす）', '織田信長（おだのぶなが）', '豊臣秀吉（とよとみひでよし）', '源頼朝（みなもとのよりとも）'])), false, '全部に付いていればよい');
});

test('revealsAnswer: 正解だけ極端に長いと答えが分かる', () => {
  assert.equal(revealsAnswer(q4('植物が育つのに必要なのは？', ['日光と水と空気と適当な温度と肥料', '砂', '石', '鉄'])), true);
  assert.equal(revealsAnswer(q4('「生える」の読み方は？', ['はえる', 'うまれる', 'いきる', 'おえる'])), false);
});

test('revealsAnswer: 正解の言葉が問題文に書いてあると答えが分かる', () => {
  assert.equal(revealsAnswer(q4('「税金」の「税金」はどれ？', ['税金', '料金', '現金', '貯金'])), true);
  assert.equal(revealsAnswer(q4('47 + 35 はいくつ？', ['82', '72', '712', '83'])), false);
  assert.equal(revealsAnswer(q4('「春」を英語で言うと？', ['spring', 'winter', 'summer', 'fall'])), false);
  assert.equal(revealsAnswer(q4('「海」と「山」のうち、しょっぱい水があるのは？', ['海', '山', '川', '池'])), false, '1文字の選択肢は比べない');
});

test('sanitizeQuestions: 問題文が同じ（空白・記号のちがいだけ）問題は1つだけ残る', () => {
  const a = q4('「海」の読み方はどれ？', ['うみ', 'かい', 'あま', 'み'], 0);
  const b = q4('「海」の 読み方は どれ?', ['うみ', 'かい', 'あお', 'なみ'], 0);
  const out = sanitizeQuestions([a, b, ...Array.from({ length: 10 }, (_, i) => valid(i))], 12);
  assert.equal(out.filter(q => q.question.includes('海')).length, 1);
});

test('sanitizeQuestions: 答えが分かる問題は除外される', () => {
  const giveaway = q4('「税金」の「税金」はどれ？', ['税金', '料金', '現金', '貯金']);
  const out = sanitizeQuestions([giveaway, valid(1)], 10);
  assert.deepEqual(out.map(q => q.question), ['問題1']);
});

// ---------- T12: 条件と正解が合わない問題 ----------


test('violatesKanjiCondition: 「『海』を使った言葉」の正解に『海』が入っていなければ捨てる', () => {
  assert.equal(violatesKanjiCondition(q4('『海』という漢字を使っていて、船が出入りする場所を表す言葉は？', ['海岸', '漁港', '海水', '山道'], 1)), true);
  assert.equal(violatesKanjiCondition(q4('「海」が入る言葉で、船が出入りする場所は？', ['港', '海原', '湖', '川'], 0)), true);
});

test('violatesKanjiCondition: 正解に漢字が入っていれば通す', () => {
  assert.equal(violatesKanjiCondition(q4('『海』という漢字を使っていて、海で泳ぐことを表す言葉は？', ['海水浴', '山登り', '川遊び', '雪合戦'], 0)), false);
  assert.equal(violatesKanjiCondition(q4('『生』の字を使う言葉はどれ？', ['先生', '学校', '教室', '友達'], 0)), false);
});

test('violatesKanjiCondition: 否定の問い・読みや意味を問う問題・正解が言葉でない問題は見ない', () => {
  assert.equal(violatesKanjiCondition(q4('『海』を使わない言葉はどれ？', ['海岸', '漁港', '海水', '海辺'], 1)), false);
  assert.equal(violatesKanjiCondition(q4('『海』を使った言葉ではないものはどれ？', ['海岸', '漁港', '海水', '海辺'], 1)), false);
  assert.equal(violatesKanjiCondition(q4('『海』を使った「海辺」の読み方は？', ['うみべ', 'かいへん', 'うみへん', 'かいべ'], 0)), false);
  assert.equal(violatesKanjiCondition(q4('『海』を使った「海原」の意味は？', ['広い海', '高い山', '長い川', '深い森'], 0)), false);
  assert.equal(violatesKanjiCondition(q4('『氵』を使った漢字はどれ？（部首）', ['池', '林', '花', '空'], 0)), false);
  assert.equal(violatesKanjiCondition(q4('『海』を使った言葉はどれ？', ['うみべ', 'やまみち', 'かわら', 'もり'], 0)), false);
});

test('evaluateArithmetic: 四則演算とかっこ・全角・記号のゆれ', () => {
  assert.equal(evaluateArithmetic('36 − 19'), 17);
  assert.equal(evaluateArithmetic('３×４＋２'), 14);
  assert.equal(evaluateArithmetic('(2+3)×4'), 20);
  assert.equal(evaluateArithmetic('12÷4'), 3);
  assert.equal(evaluateArithmetic('5÷0'), null);
  assert.equal(evaluateArithmetic('36'), null);
  assert.equal(evaluateArithmetic('りんご+2'), null);
});

test('violatesArithmetic: 「36 − 19 はいくつ？」の正解が式の答えと違えば捨てる', () => {
  assert.equal(violatesArithmetic(q4('36 − 19 はいくつ？', ['17', '27', '15', '13'], 1)), true);
  assert.equal(violatesArithmetic(q4('36 − 19 はいくつ？', ['17', '27', '15', '13'], 0)), false);
  assert.equal(violatesArithmetic(q4('つぎの計算をしましょう。8 × 7', ['56', '54', '48', '63'], 0)), false);
  assert.equal(violatesArithmetic(q4('8 × 7 = ?', ['56', '54', '48', '63'], 2)), true);
});

test('violatesArithmetic: 文章題・□を求める問題・単位つきの答えは見ない', () => {
  assert.equal(violatesArithmetic(q4('りんごが27こ、みかんが19こあります。あわせて何こ？', ['36こ', '46こ', '45こ', '8こ'], 0)), false);
  assert.equal(violatesArithmetic(q4('□ + 28 = 61 の□に入る数は？', ['33', '43', '89', '23'], 1)), false);
  assert.equal(violatesArithmetic(q4('47 + 35 の答えから10をひくといくつ？', ['72', '82', '62', '92'], 0)), false);
});

test('violatesArithmetic: 「答えが20になる式」は正解が20になり、不正解は20にならないこと', () => {
  assert.equal(violatesArithmetic(q4('答えが20になるたし算はどれ？', ['12+8', '11+7', '9+9', '13+6'], 0)), false);
  assert.equal(violatesArithmetic(q4('答えが20になるたし算はどれ？', ['12+7', '11+7', '9+9', '13+6'], 0)), true);
  assert.equal(violatesArithmetic(q4('答えが20になるたし算はどれ？', ['12+8', '15+5', '9+9', '13+6'], 0)), true);
  assert.equal(violatesArithmetic(q4('答えが20にならない式はどれ？', ['12+7', '15+5', '10+10', '18+2'], 0)), false);
});

test('sanitizeQuestions: 条件と正解が合わない問題は除外される', () => {
  const bad = q4('『海』という漢字を使っていて、船が出入りする場所を表す言葉は？', ['海岸', '漁港', '海水', '山道'], 1);
  const result = sanitizeQuestions([bad, valid(1)], 10);
  assert.equal(result.length, 1);
  assert.equal(result[0].question, '問題1');
});

// ---------- T12: 同じ型の問題が多い ----------

test('questionKind: 問い方の種類を見分ける', () => {
  assert.equal(questionKind({ question: '漢字『海』の読み方として正しいものは？' }), '読み');
  assert.equal(questionKind({ question: '「よむ」を漢字で書くとどれ？' }), '書き');
  assert.equal(questionKind({ question: '「海原」の意味はどれ？' }), '意味');
  assert.equal(questionKind({ question: '36 − 19 はいくつ？' }), '計算');
  assert.equal(questionKind({ question: '「apple」はどの果物？' }), '英語');
  assert.equal(questionKind({ question: '日本でいちばん高い山は？' }), 'その他');
});

test('pickVaried: 予備があれば同じ型を4問までにして、ほかの型を先に選ぶ', () => {
  const reading = Array.from({ length: 8 }, (_, i) => ({ question: `『字${i}』の読み方は？` }));
  const others = Array.from({ length: 4 }, (_, i) => ({ question: `「言葉${i}」の意味は？` }));
  const picked = pickVaried([...reading, ...others], 10);
  assert.equal(picked.length, 10);
  assert.equal(picked.filter(q => questionKind(q) === '意味').length, 4);
  assert.equal(picked.filter(q => questionKind(q) === '読み').length, 6);
  // 元の順番を保つ
  assert.deepEqual(picked.slice(0, 4).map(q => q.question), reading.slice(0, 4).map(q => q.question));
});

test('pickVaried: ほかの型が無ければ同じ型のまま total 問にする（数は減らさない）', () => {
  const calc = Array.from({ length: 12 }, (_, i) => ({ question: `${i} + 1 はいくつ？` }));
  assert.equal(pickVaried(calc, 10).length, 10);
  assert.deepEqual(pickVaried(calc.slice(0, 9), 10), calc.slice(0, 9));
});

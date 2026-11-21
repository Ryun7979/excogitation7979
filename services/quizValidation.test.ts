import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuestions, isPlayableQuestion, shuffleOptions, reconcileAnswer, refersToMaterial, copiesOriginal } from './quizValidation.ts';

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

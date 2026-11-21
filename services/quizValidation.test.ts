import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuestions, isPlayableQuestion, shuffleOptions } from './quizValidation.ts';

const valid = (n: number) => ({
  question: `問題${n}`,
  options: ['A', 'B', 'C', 'D'],
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

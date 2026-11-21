import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswerCheck, answerCheckProblem, parseAnswerVerdicts, buildAnswerCheckPrompt } from './answerCheck.ts';

const q = (correctAnswerIndex: number) => ({
  question: 'ヨウ素液をつけると青むらさき色になるものは？',
  options: ['でんぷん', 'しお', 'さとう', 'あぶら'],
  correctAnswerIndex,
});
const verdict = (index: number, correctOptions: number[], broken = false) => ({ index, check: '', correctOptions, broken });

test('answerCheckProblem: 正しい選択肢がつけた正解ちょうど1つなら残す', () => {
  assert.equal(answerCheckProblem(q(0), verdict(0, [0])), null);
});

test('answerCheckProblem: 正しい選択肢が2つ・0こ・別の選択肢・問題が壊れているときは捨てる', () => {
  assert.equal(answerCheckProblem(q(0), verdict(0, [0, 2])), 'multipleCorrect');
  assert.equal(answerCheckProblem(q(0), verdict(0, [])), 'noCorrect');
  assert.equal(answerCheckProblem(q(1), verdict(0, [0])), 'wrongAnswer');
  assert.equal(answerCheckProblem(q(0), verdict(0, [0], true)), 'broken');
});

test('answerCheckProblem: 答え合わせの応答にない問題は残す', () => {
  assert.equal(answerCheckProblem(q(0), undefined), null);
});

test('applyAnswerCheck: 問題のあったものだけを捨て、順番はそのまま', () => {
  const list = [q(0), q(1), q(0), q(0)];
  const kept = applyAnswerCheck(list, [verdict(0, [0]), verdict(1, [0]), verdict(3, [0, 1])]);
  assert.deepEqual(kept, [list[0], list[2]]);
});

test('parseAnswerVerdicts: 形の壊れた要素は無視し、全部壊れていれば null', () => {
  assert.equal(parseAnswerVerdicts('x'), null);
  assert.equal(parseAnswerVerdicts([{ index: 0 }]), null);
  const parsed = parseAnswerVerdicts([{ index: 0, check: 'A 正しい', correctOptions: [0, 0], broken: false }, { index: 'x' }]);
  // 同じ番号が重なっても1つとして数える
  assert.deepEqual(parsed, [{ index: 0, check: 'A 正しい', correctOptions: [0], broken: false }]);
});

test('buildAnswerCheckPrompt: 正解は伏せて渡す', () => {
  const prompt = buildAnswerCheckPrompt([q(0)]);
  assert.match(prompt, /A\) でんぷん \/ B\) しお/);
  assert.doesNotMatch(prompt, /正解: |correctAnswerIndex/);
});

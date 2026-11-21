import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistory, saveRecord, clearHistory, buildRecord, collectWrongItems, MAX_RECORDS, type PlayRecord } from './history.ts';

const memoryStorage = (limitChars = Infinity) => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limitChars) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
};

const q = (n: number) => ({ id: `q${n}`, question: `問題${n}`, options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: `解説${n}` });

const record = (n: number): PlayRecord => buildRecord({
  mode: 'STUDY', teacher: 'SUNAO', isReview: false,
  questions: [q(n), q(n + 100)],
  results: [
    { questionIndex: 0, isCorrect: false, chosenIndex: 2 },
    { questionIndex: 1, isCorrect: true, chosenIndex: 0 },
  ],
  now: new Date(2026, 10, 21, 10, n),
});

test('buildRecord: 点数とまちがえた問題（えらんだ答えつき）を記録する', () => {
  const r = record(1);
  assert.equal(r.total, 2);
  assert.equal(r.correct, 1);
  assert.deepEqual(r.wrong.map(w => [w.question, w.chosenIndex]), [['問題1', 2]]);
});

test('saveRecord / loadHistory: 新しい順に読める', () => {
  const s = memoryStorage();
  saveRecord(record(1), s);
  saveRecord(record(2), s);
  assert.deepEqual(loadHistory(s).map(r => r.wrong[0].question), ['問題2', '問題1']);
});

test('saveRecord: 上限を超えたら古いものから消す', () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_RECORDS + 5; i++) saveRecord(record(i), s);
  const list = loadHistory(s);
  assert.equal(list.length, MAX_RECORDS);
  assert.equal(list[0].wrong[0].question, `問題${MAX_RECORDS + 4}`);
});

test('saveRecord: 容量が足りなければ古いきろくを減らして保存する', () => {
  const s = memoryStorage(2000);
  for (let i = 0; i < 20; i++) assert.equal(saveRecord(record(i), s), true);
  const list = loadHistory(s);
  assert.ok(list.length > 0 && list.length < 20);
  assert.equal(list[0].wrong[0].question, '問題19', 'いちばん新しいきろくは残る');
});

test('保存できない環境でも例外を投げない', () => {
  assert.equal(saveRecord(record(1), undefined), false);
  assert.deepEqual(loadHistory(undefined), []);
  const broken = { getItem: () => '{壊れたJSON', setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadHistory(broken), []);
  assert.equal(saveRecord(record(1), broken), false);
  clearHistory(broken);
});

test('clearHistory: きろくを空にする', () => {
  const s = memoryStorage();
  saveRecord(record(1), s);
  clearHistory(s);
  assert.deepEqual(loadHistory(s), []);
});

test('collectWrongItems: 同じ問題文は1つにまとめ、新しい順に返す', () => {
  const s = memoryStorage();
  saveRecord(record(1), s);
  saveRecord(record(2), s);
  saveRecord(record(1), s);
  assert.deepEqual(collectWrongItems(loadHistory(s)).map(w => w.question), ['問題1', '問題2']);
  assert.equal(collectWrongItems(loadHistory(s), 1).length, 1);
});

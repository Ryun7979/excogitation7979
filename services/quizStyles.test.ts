import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignQuizStyles, QUIZ_STYLES } from './quizStyles.ts';

test('assignQuizStyles: 10問ならスタイルが重複しない', () => {
  const styles = assignQuizStyles(10);
  assert.equal(styles.length, 10);
  assert.equal(new Set(styles.map(s => s.name)).size, 10);
});

test('assignQuizStyles: スタイル数より多くても一巡するまで重複しない', () => {
  const n = QUIZ_STYLES.length;
  const styles = assignQuizStyles(n + 3);
  assert.equal(styles.length, n + 3);
  assert.equal(new Set(styles.slice(0, n).map(s => s.name)).size, n);
});

test('QUIZ_STYLES: なぞなぞは含まず、10問分のスタイル数がある', () => {
  assert.ok(!QUIZ_STYLES.some(s => s.name.includes('なぞなぞ')));
  assert.ok(QUIZ_STYLES.length >= 10);
});

test('assignQuizStyles: 毎回順番が変わる', () => {
  const runs = new Set(Array.from({ length: 10 }, () => assignQuizStyles(10).map(s => s.name).join()));
  assert.ok(runs.size > 1);
});

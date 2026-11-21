import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignQuizStyles, QUIZ_STYLES, assignStudyForms, STUDY_FORMS } from './quizStyles.ts';

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

test('QUIZ_STYLES: 例は【題材】の形だけで、具体的な題材を書かない', () => {
  // 具体例を書くと、教材と無関係にその例がそのまま出題されるため
  for (const s of QUIZ_STYLES) assert.ok(s.example.includes('【題材'), s.name);
});

test('assignQuizStyles: 毎回順番が変わる', () => {
  const runs = new Set(Array.from({ length: 10 }, () => assignQuizStyles(10).map(s => s.name).join()));
  assert.ok(runs.size > 1);
});

test('assignStudyForms: 12問で同じ問い方は3問まで、5種類すべて使う', () => {
  const forms = assignStudyForms(12);
  assert.equal(forms.length, 12);
  const counts: Record<string, number> = {};
  forms.forEach(f => { counts[f.name] = (counts[f.name] ?? 0) + 1; });
  assert.ok(Object.values(counts).every(n => n <= 3));
  assert.equal(Object.keys(counts).length, STUDY_FORMS.length);
});

test('assignStudyForms: 部首・画数・筆順は割り当てない', () => {
  assert.ok(!STUDY_FORMS.some(f => /部首|画数|筆順/.test(f.name + f.howTo)));
});

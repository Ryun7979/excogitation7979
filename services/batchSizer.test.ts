import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_BATCH_LEVELS, stepDown, stepUp, initialBatchSize } from './batchSizer.ts';

test('段階は 20 → 12 → 8 → 5 の順', () => {
  assert.deepEqual(IMAGE_BATCH_LEVELS, [20, 12, 8, 5]);
});

test('stepDown: 1段ずつ下がり、最低5で止まる', () => {
  assert.equal(stepDown(20), 12);
  assert.equal(stepDown(12), 8);
  assert.equal(stepDown(8), 5);
  assert.equal(stepDown(5), 5);
});

test('stepDown: 中間値（例:17枚）はすぐ下の段に落ちる', () => {
  assert.equal(stepDown(17), 12);
  assert.equal(stepDown(7), 5);
  assert.equal(stepDown(3), 3); // 5未満しか無い場合はそのまま（全数送信）
});

test('stepUp: 1段ずつ戻り、最大20で止まる', () => {
  assert.equal(stepUp(5), 8);
  assert.equal(stepUp(8), 12);
  assert.equal(stepUp(12), 20);
  assert.equal(stepUp(20), 20);
});

test('initialBatchSize: 前回の適応値と実際の枚数の小さい方', () => {
  assert.equal(initialBatchSize(20, 30), 20); // 30枚あっても上限20
  assert.equal(initialBatchSize(12, 30), 12); // 前回12に下がっていたら12
  assert.equal(initialBatchSize(20, 3), 3);   // 3枚しか無ければ3
});

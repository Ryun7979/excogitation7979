import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCachedAnalysis, setCachedAnalysis, resetAnalysisCacheForTest } from './imageAnalysisCache.ts';

test('未解析の画像はundefinedを返す', () => {
  resetAnalysisCacheForTest();
  const file = new File(['x'], 'a.png');
  assert.equal(getCachedAnalysis(file), undefined);
});

test('setCachedAnalysisで保存した内容をgetCachedAnalysisで取得できる', () => {
  resetAnalysisCacheForTest();
  const file = new File(['x'], 'a.png');
  setCachedAnalysis(file, '2桁の足し算の練習問題');
  assert.equal(getCachedAnalysis(file), '2桁の足し算の練習問題');
});

test('異なるFileオブジェクトは別々にキャッシュされる（同名でも参照が違えば別扱い）', () => {
  resetAnalysisCacheForTest();
  const fileA = new File(['x'], 'same.png');
  const fileB = new File(['x'], 'same.png');
  setCachedAnalysis(fileA, 'A用の要約');
  assert.equal(getCachedAnalysis(fileB), undefined);
  assert.equal(getCachedAnalysis(fileA), 'A用の要約');
});

test('同じFile参照への再設定は上書きされる', () => {
  resetAnalysisCacheForTest();
  const file = new File(['x'], 'a.png');
  setCachedAnalysis(file, '最初の要約');
  setCachedAnalysis(file, '更新後の要約');
  assert.equal(getCachedAnalysis(file), '更新後の要約');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFastRetryEnabled, setFastRetryEnabled } from './featureFlags.ts';

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

test('未設定時はデフォルトでON', () => {
  const storage = new FakeStorage();
  assert.equal(isFastRetryEnabled(storage), true);
});

test('setFastRetryEnabled(false)で保存した後はOFFとして読み出せる', () => {
  const storage = new FakeStorage();
  setFastRetryEnabled(false, storage);
  assert.equal(isFastRetryEnabled(storage), false);
});

test('setFastRetryEnabled(true)で明示的にONへ戻せる', () => {
  const storage = new FakeStorage();
  setFastRetryEnabled(false, storage);
  setFastRetryEnabled(true, storage);
  assert.equal(isFastRetryEnabled(storage), true);
});

test('別ストレージインスタンス間では値が独立している', () => {
  const s1 = new FakeStorage();
  const s2 = new FakeStorage();
  setFastRetryEnabled(false, s1);
  assert.equal(isFastRetryEnabled(s2), true);
});

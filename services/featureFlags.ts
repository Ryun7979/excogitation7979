// 隠し機能の設定。タイトル画面の目立たないスイッチで切り替え、
// 選択内容はlocalStorageに保存して次回起動時も引き継ぐ。

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'ai-quiz:fastRetryEnabled';

/** 高速リトライ機能（画像解析結果のキャッシュ利用）が有効か。未設定時はON */
export const isFastRetryEnabled = (storage: KeyValueStorage = localStorage): boolean => {
  const stored = storage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
};

export const setFastRetryEnabled = (enabled: boolean, storage: KeyValueStorage = localStorage): void => {
  storage.setItem(STORAGE_KEY, String(enabled));
};

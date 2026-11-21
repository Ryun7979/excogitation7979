// --- Utility: Image Resizing for Token Optimization ---
// Geminiは縦横とも384px以下の画像を最小トークン数(258)で処理し、それを超えると
// タイル分割でトークン数が数倍になる。それでも 1024px で送る。384だとドリルの小さな文字
// （例文の漢字・計算式）が読めず、大きな見出しの字だけから出題されたり
// 「枝」を「技」と読み違えたりするため。
// - 2フェーズ生成（高速リトライON）: 解析結果がキャッシュされるので送信は1回きり
// - 1フェーズ生成（高速リトライOFF）: 再試行のたびに送り直すが、読めないよりは良い
export const IMAGE_MAX_SIZE = 1024;
export const resizeImage = async (file: File, maxWidth = IMAGE_MAX_SIZE): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve(base64);
    };
    img.onerror = reject;
  });
};

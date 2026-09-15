import 'dotenv/config';
import path from 'node:path';
import { launchBrowser, humanPause } from './browser.js';
import { isLoginPage } from './facebook.js';

const userDataDir = path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile');

console.log(`[login] Chrome profile: ${userDataDir}`);
console.log('[login] Đăng nhập tài khoản ADMIN nhóm, đợi feed hiện ra, rồi quay lại terminal nhấn Enter.');

const { browser, page } = await launchBrowser({ userDataDir, headed: true });
await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 90_000 });
await humanPause(1000, 2000);

if (!(await isLoginPage(page))) {
  console.log('[login] Session đã đăng nhập sẵn.');
} else {
  console.log('[login] Trình duyệt đang mở form đăng nhập.');
}

await new Promise((resolve) => {
  process.stdin.resume();
  process.stdout.write('Nhấn Enter sau khi đã vào Facebook (không còn trang login/checkpoint)... ');
  process.stdin.once('data', resolve);
});

await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 90_000 });
if (await isLoginPage(page)) {
  console.error('[fail] Vẫn chưa đăng nhập. Session chưa dùng được trên VPS.');
  await browser.close();
  process.exit(1);
}

console.log('[ok] Session đã lưu trong', userDataDir);
console.log('[next] rsync thư mục này lên VPS (xem README). Đóng Chrome.');
await browser.close();
process.exit(0);

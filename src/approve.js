import 'dotenv/config';
import path from 'node:path';
import { launchBrowser, screenshot } from './browser.js';
import { approveMember } from './facebook.js';

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const member = arg('--member') || arg('-m') || process.argv[2] || '';
const groupId = arg('--group') || arg('-g') || process.env.FB_GROUP_ID || '';
const headed = hasFlag('--headed');
const userDataDir = path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile');

if (!member || hasFlag('--help') || hasFlag('-h')) {
  console.log(`Duyệt 1 thành viên đang chờ trong Facebook Group.

Cách dùng:
  node src/approve.js --member "https://www.facebook.com/username"
  node src/approve.js --member "Nguyễn Văn A"
  node src/approve.js --group 123456789 --member "Nguyễn Văn A"

Biến môi trường (.env):
  FB_GROUP_ID          ID nhóm
  FB_USER_DATA_DIR     thư mục Chrome profile (mặc định ./data/chrome-profile)

Tùy chọn:
  --headed             mở Chrome có cửa sổ (debug)
`);
  process.exit(member ? 0 : 1);
}

if (!groupId) {
  console.error('[fail] Thiếu FB_GROUP_ID hoặc --group');
  process.exit(1);
}

console.log(`[start] group=${groupId}`);
console.log(`[start] member=${member}`);
console.log(`[start] profile=${userDataDir}`);
console.log(`[start] headed=${headed}`);

const { browser, page } = await launchBrowser({ userDataDir, headed });

try {
  const result = await approveMember(page, { groupId, member });
  if (result.ok) {
    console.log('[ok] Đã bấm Phê duyệt.');
    console.log(`[ok] Đối tượng: ${result.query.name}`);
    console.log(`[ok] Cách khớp: ${result.via}`);
    console.log(`[ok] Ảnh: ${result.screenshot}`);
    process.exitCode = 0;
  } else {
    console.error('[fail] Không duyệt được thành viên.');
    console.error(`[fail] Lý do: ${result.reason}`);
    console.error(`[fail] Ảnh: ${result.screenshot}`);
    process.exitCode = 1;
  }
} catch (err) {
  const shot = await screenshot(page, 'error').catch(() => '');
  console.error('[fail]', err.message || err);
  if (shot) console.error('[fail] Ảnh:', shot);
  process.exitCode = 1;
} finally {
  await browser.close();
}

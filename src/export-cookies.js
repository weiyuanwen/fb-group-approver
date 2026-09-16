import 'dotenv/config';
import path from 'node:path';
import { launchBrowser, humanPause } from './browser.js';
import { saveFacebookCookies } from './cookies.js';

const userDataDir = path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile');
const { browser, page } = await launchBrowser({ userDataDir, headed: false });
try {
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 90_000 });
  await humanPause(800, 1400);
  const saved = await saveFacebookCookies(page);
  console.log(`[export] cookies=${saved.count} c_user=${saved.hasCUser} xs=${saved.hasXs}`);
  console.log(`[export] ${saved.file}`);
  if (!saved.hasCUser || !saved.hasXs) process.exitCode = 1;
} finally {
  await browser.close();
}

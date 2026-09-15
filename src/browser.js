import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Delay giống người: 800–2500ms mặc định. */
export async function humanPause(minMs = 800, maxMs = 2500) {
  const ms = randomInt(minMs, maxMs);
  await sleep(ms);
  return ms;
}

export async function humanType(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: randomInt(45, 140) });
    if (Math.random() < 0.08) await sleep(randomInt(180, 420));
  }
}

export function resolveProfileDir(userDataDir) {
  mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
}

export async function launchBrowser({ userDataDir, headed = false }) {
  const dir = resolveProfileDir(userDataDir);
  const browser = await puppeteer.launch({
    headless: headed ? false : true,
    userDataDir: dir,
    defaultViewport: { width: 1366, height: 768 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  );
  return { browser, page };
}

export async function screenshot(page, name) {
  mkdirSync('data/screenshots', { recursive: true });
  const file = `data/screenshots/${Date.now()}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

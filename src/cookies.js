import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function cookiesPath() {
  return path.resolve(process.env.FB_COOKIES_FILE || './data/fb-cookies.json');
}

function toPuppeteerCookie(cookie) {
  const sameSiteMap = {
    Strict: 'Strict',
    Lax: 'Lax',
    None: 'None',
  };
  const out = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
  };
  if (cookie.expires && cookie.expires > 0) out.expires = cookie.expires;
  if (cookie.sameSite && sameSiteMap[cookie.sameSite]) out.sameSite = sameSiteMap[cookie.sameSite];
  return out;
}

export async function saveFacebookCookies(page) {
  const cookies = await page.cookies('https://www.facebook.com', 'https://www.messenger.com');
  const file = cookiesPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cookies.map(toPuppeteerCookie), null, 2));
  const names = cookies.map((c) => c.name);
  return { file, count: cookies.length, hasCUser: names.includes('c_user'), hasXs: names.includes('xs') };
}

export async function loadFacebookCookies(page) {
  const file = cookiesPath();
  if (!existsSync(file)) return { applied: false, reason: 'missing-file' };
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) return { applied: false, reason: 'empty' };
  await page.setCookie(...raw.map(toPuppeteerCookie));
  const names = raw.map((c) => c.name);
  return { applied: true, count: raw.length, hasCUser: names.includes('c_user'), hasXs: names.includes('xs') };
}

export async function hasCUserCookie(page) {
  const cookies = await page.cookies();
  return cookies.some((cookie) => cookie.name === 'c_user');
}

/**
 * Prefer the live Chrome profile session. Re-injecting the JSON cookie jar
 * on top of an already-logged-in profile can make Facebook drop c_user/xs.
 */
export async function ensureFacebookSession(page) {
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (await hasCUserCookie(page)) {
    await saveFacebookCookies(page);
    return { ok: true, via: 'profile' };
  }

  const injected = await loadFacebookCookies(page);
  if (!injected.applied || !injected.hasCUser) {
    return { ok: false, via: injected.reason || 'missing-cookies' };
  }

  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (await hasCUserCookie(page)) {
    await saveFacebookCookies(page);
    return { ok: true, via: 'cookies' };
  }

  return { ok: false, via: 'not-logged-in' };
}

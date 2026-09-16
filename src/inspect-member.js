import path from 'node:path';
import { launchBrowser, humanPause, screenshot } from './browser.js';
import { loadFacebookCookies, saveFacebookCookies } from './cookies.js';

function groupIdFromEnv(override) {
  return String(override || process.env.FB_GROUP_ID || '782860725537921');
}

function canonicalFacebookUrl(url) {
  return String(url || '')
    .trim()
    .replace(/^https?:\/\/(?:web|m|mbasic)\.facebook\.com/i, 'https://www.facebook.com')
    .replace(/^https?:\/\/facebook\.com/i, 'https://www.facebook.com');
}

function readProfileFromDom() {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const html = document.documentElement.innerHTML;
  const h1 = [...document.querySelectorAll('h1')].map((el) => el.innerText.trim()).filter(Boolean);
  const name = h1.find((t) => !/thông báo|đoạn chat|notification|chats/i.test(t)) || '';
  const meta = document.querySelector('meta[property="al:android:url"]')?.content || '';
  const metaId = meta.match(/fb:\/\/(?:profile|page|group)\/(\d+)/)?.[1] || '';
  const hrefId =
    location.href.match(/[?&]id=(\d+)/)?.[1] ||
    location.href.match(/\/(?:profile\.php\?id=|user\/|posts\/)(\d+)/)?.[1] ||
    '';
  const htmlId =
    html.match(/"userID":"(\d+)"/)?.[1] ||
    html.match(/"profile_owner":\{"id":"(\d+)"/)?.[1] ||
    html.match(/"actorID":"(\d+)"/)?.[1] ||
    html.match(/"author":\{"__typename":"User","id":"(\d+)"/)?.[1] ||
    html.match(/fb:\/\/profile\/(\d+)/)?.[1] ||
    '';
  const usernamePath = location.pathname.replace(/^\//, '').split('/').filter(Boolean)[0] || null;
  const reserved = ['profile.php', 'share', 'groups', 'reel', 'watch', 'posts', 'photo', 'people', 'pages'];
  return {
    href: location.href,
    title: document.title,
    name,
    username: usernamePath && !reserved.includes(usernamePath) ? usernamePath : null,
    id: metaId || hrefId || htmlId || null,
  };
}

export async function inspectMemberProfile({ url, groupId, headed = false, capture = false } = {}) {
  const input = canonicalFacebookUrl(url);
  if (!input) {
    return { ok: false, reason: 'missing_url' };
  }

  const gid = groupIdFromEnv(groupId);
  const { browser, page } = await launchBrowser({
    userDataDir: path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile'),
    headed,
  });
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(45_000);

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await loadFacebookCookies(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await humanPause(700, 1200);
    if (!(await page.cookies('https://www.facebook.com')).some((c) => c.name === 'c_user')) {
      return {
        ok: false,
        reason: 'not-logged-in',
        shot: capture ? await screenshot(page, 'lookup-not-logged-in') : null,
      };
    }
    await saveFacebookCookies(page);

    await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await humanPause(1800, 2600);
    const landing = await page.evaluate(readProfileFromDom);

    let uid = landing.id;
    if (!uid) {
      const html = await page.content();
      uid =
        html.match(/"userID":"(\d+)"/)?.[1] ||
        html.match(/fb:\/\/profile\/(\d+)/)?.[1] ||
        html.match(/profile\.php\?id=(\d+)/)?.[1] ||
        null;
      landing.id = uid;
    }

    let group = null;
    if (uid) {
      await page.goto(`https://www.facebook.com/groups/${gid}/user/${uid}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await humanPause(1600, 2400);
      group = await page.evaluate(() => {
        const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const h1 = [...document.querySelectorAll('h1')].map((el) => el.innerText.trim()).filter(Boolean);
        const name = h1.find((t) => !/thông báo|đoạn chat|notification|chats/i.test(t)) || '';
        const notMember = /không phải thành viên|isn'?t a member|is not a member|not a member of this group|không thuộc nhóm|chưa tham gia nhóm/i.test(text);
        const joined = text.match(/Thành viên của .+? từ ngày [^.]+/)?.[0] || null;
        const summaryStart = text.search(/Tóm tắt về thành viên|Member summary/i);
        const summary = summaryStart >= 0 ? text.slice(summaryStart, summaryStart + 650).trim() : null;
        return { name, notMember, joined, summary };
      });
    }

    const name = (group?.name || landing.name || landing.username || '').trim() || null;
    return {
      ok: Boolean(uid || name),
      reason: uid || name ? 'ok' : 'not_found',
      uid: uid || null,
      name,
      username: landing.username,
      membership: !uid ? 'unknown' : group?.notMember ? 'not_member' : 'member',
      joined: group?.joined || null,
      summary: group?.summary || null,
    };
  } finally {
    await browser.close();
  }
}

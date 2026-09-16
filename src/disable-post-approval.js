import path from 'node:path';
import { launchBrowser, humanPause, screenshot } from './browser.js';
import { loadFacebookCookies, saveFacebookCookies } from './cookies.js';

function groupIdFromEnv(override) {
  return String(override || process.env.FB_GROUP_ID || '782860725537921');
}

function uidFromMember(member, uid) {
  if (uid) return String(uid);
  const raw = String(member || '');
  return raw.match(/profile\.php\?id=(\d+)/i)?.[1] || raw.match(/\/(?:user|profile)\/(\d+)/i)?.[1] || raw.match(/(\d{6,})/)?.[1] || null;
}

export async function disableMemberPostApproval({ member, uid, groupId, headed = false } = {}) {
  const gid = groupIdFromEnv(groupId);
  const userId = uidFromMember(member, uid);
  if (!userId) {
    return { ok: false, reason: 'missing_uid' };
  }

  const { browser, page } = await launchBrowser({
    userDataDir: path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile'),
    headed,
  });
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(45_000);

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await loadFacebookCookies(page);
    await page.reload({ waitUntil: 'load', timeout: 45_000 });
    await humanPause(800, 1400);
    if (!(await page.cookies('https://www.facebook.com')).some((c) => c.name === 'c_user')) {
      return { ok: false, reason: 'not-logged-in', shot: await screenshot(page, 'not-logged-in') };
    }
    await saveFacebookCookies(page);

    await page.goto(`https://www.facebook.com/groups/${gid}/user/${userId}/`, { waitUntil: 'load', timeout: 45_000 });
    await humanPause(1600, 2400);
    await page.keyboard.press('Escape');
    await humanPause(400, 700);

    const opened = await page.evaluate(() => {
      const menus = [...document.querySelectorAll('div[aria-label="Menu hành động đối với thành viên"], div[aria-label="Member actions menu"]')];
      const visible = menus.find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top > 80 && r.top < 900;
      });
      const el = visible || menus[0];
      if (!el) return false;
      el.click();
      return true;
    });
    if (!opened) {
      return { ok: false, reason: 'menu_not_found', uid: userId, shot: await screenshot(page, 'no-member-menu') };
    }
    await humanPause(900, 1400);

    const action = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => ({
        el,
        label: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      }));
      const off = items.find((item) => /tắt tính năng phê duyệt bài viết/i.test(item.label));
      if (off) {
        off.el.click();
        return { kind: 'disable', label: off.label };
      }
      const on = items.find((item) => /bật tính năng phê duyệt bài viết/i.test(item.label));
      if (on) {
        return { kind: 'already_off', label: on.label };
      }
      return { kind: 'unknown', labels: items.map((item) => item.label) };
    });

    if (action.kind === 'already_off') {
      return { ok: true, reason: 'already_off', uid: userId, action };
    }
    if (action.kind !== 'disable') {
      return { ok: false, reason: 'toggle_not_found', uid: userId, action, shot: await screenshot(page, 'no-toggle') };
    }

    await humanPause(1200, 1800);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('div[role="button"], button')].find((el) => {
        const t = (el.innerText || '').trim();
        return /^(tắt|xác nhận|lưu|save|confirm|xong|done|ok)$/i.test(t);
      });
      btn?.click();
    });
    await humanPause(1500, 2200);

    return { ok: true, reason: 'disabled', uid: userId, action };
  } finally {
    await browser.close();
  }
}

const isCli = process.argv[1] && path.basename(process.argv[1]) === 'disable-post-approval.js';
if (isCli) {
  const member = process.argv[2];
  if (!member) {
    console.error('Usage: node src/disable-post-approval.js <profile-url-or-uid>');
    process.exit(1);
  }
  const result = await disableMemberPostApproval({ member });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

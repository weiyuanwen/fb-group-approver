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

function clickMemberActionsMenu() {
  const labelRe = /hành động đối với thành viên|member actions menu|hành động thành viên/i;
  const labeled = [...document.querySelectorAll('[aria-label]')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 12 && r.height > 12 && r.top > 80 && r.top < 720 && labelRe.test(el.getAttribute('aria-label') || '');
  });
  if (labeled) {
    labeled.click();
    return 'aria';
  }

  const buttons = [...document.querySelectorAll('[role="button"]')].filter((el) => {
    const r = el.getBoundingClientRect();
    const aria = el.getAttribute('aria-label') || '';
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (r.top < 280 || r.top > 640) return false;
    if (r.left < 860) return false;
    if (r.width < 20 || r.width > 52 || r.height < 20 || r.height > 52) return false;
    if (/xem trang cá nhân|nhắn tin|message|bạn bè|messenger|thông báo/i.test(`${aria} ${text}`)) return false;
    return true;
  });
  buttons.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return ra.top - rb.top || rb.left - ra.left;
  });
  if (!buttons[0]) return null;
  buttons[0].click();
  return 'overflow';
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
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await humanPause(800, 1400);
    if (!(await page.cookies('https://www.facebook.com')).some((c) => c.name === 'c_user')) {
      return { ok: false, reason: 'not-logged-in', shot: await screenshot(page, 'not-logged-in') };
    }
    await saveFacebookCookies(page);

    await page.goto(`https://www.facebook.com/groups/${gid}/user/${userId}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await humanPause(1800, 2600);
    await page.keyboard.press('Escape');
    await humanPause(500, 800);

    let opened = null;
    for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
      opened = await page.evaluate(clickMemberActionsMenu);
      if (!opened) await humanPause(500, 800);
    }
    if (!opened) {
      return { ok: false, reason: 'menu_not_found', uid: userId, shot: await screenshot(page, 'no-member-menu') };
    }
    await humanPause(900, 1400);

    const action = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => ({
        el,
        label: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      }));
      const off = items.find((item) => /tắt.*phê duyệt bài viết|turn off post approval/i.test(item.label));
      if (off) {
        off.el.click();
        return { kind: 'disable', label: off.label };
      }
      const on = items.find((item) => /bật.*phê duyệt bài viết|turn on post approval/i.test(item.label));
      if (on) {
        return { kind: 'already_off', label: on.label };
      }
      return { kind: 'unknown', labels: items.map((item) => item.label) };
    });

    if (action.kind === 'already_off') {
      return { ok: true, reason: 'already_off', uid: userId, opened, action };
    }
    if (action.kind !== 'disable') {
      return {
        ok: false,
        reason: 'toggle_not_found',
        uid: userId,
        opened,
        action,
        shot: await screenshot(page, 'no-toggle'),
      };
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

    return { ok: true, reason: 'disabled', uid: userId, opened, action };
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

import path from 'node:path';
import { humanPause, launchBrowserRetry, screenshot } from './browser.js';
import { ensureFacebookSession } from './cookies.js';

function groupIdFromEnv(override) {
  return String(override || process.env.FB_GROUP_ID || '782860725537921');
}

function uidFromMember(member, uid) {
  if (uid) return String(uid);
  const raw = String(member || '');
  return raw.match(/profile\.php\?id=(\d+)/i)?.[1] || raw.match(/\/(?:user|profile)\/(\d+)/i)?.[1] || raw.match(/(\d{6,})/)?.[1] || null;
}

function readRestrictionStatus() {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  if (/đang tắt phê duyệt bài viết/i.test(text) || /hiện không có hạn chế/i.test(text)) {
    return { kind: 'off', label: 'off' };
  }
  if (/đang bật phê duyệt bài viết/i.test(text)) {
    return { kind: 'on', label: 'Đang bật phê duyệt bài viết' };
  }
  return { kind: 'unknown', label: null };
}

async function openMemberPage(page, gid, userId) {
  await page.goto(`https://www.facebook.com/groups/${gid}/user/${userId}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await humanPause(1800, 2600);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollBy(0, 400));
  await humanPause(700, 1100);
  await page.waitForFunction(
    () => /tóm tắt về thành viên|hạn chế|đang (bật|tắt) phê duyệt bài viết|hiện không có hạn chế/i.test(document.body.innerText || ''),
    { timeout: 20_000 },
  ).catch(() => {});
}

async function confirmIfAsked(page) {
  await humanPause(800, 1300);
  await page.evaluate(() => {
    const compact = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
    const btn = [...document.querySelectorAll('div[role="button"], button')].find((el) => {
      const t = compact(el);
      return /^(tắt|tắt tính năng|xác nhận|lưu|save|confirm|xong|done|ok)$/i.test(t);
    });
    btn?.click();
  });
  await humanPause(1400, 2000);
}

async function clickTurnOffFromPostMenu(page) {
  const opened = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[aria-label]')].filter((el) => {
      const r = el.getBoundingClientRect();
      const aria = el.getAttribute('aria-label') || '';
      return r.width > 12 && r.height > 12 && r.top > 80 && /hành động đối với bài viết này/i.test(aria);
    });
    if (!buttons[0]) return null;
    buttons[0].click();
    return buttons[0].getAttribute('aria-label');
  });
  if (!opened) return { ok: false, reason: 'post_menu_not_found' };

  await page.waitForFunction(
    () => [...document.querySelectorAll('[role="menuitem"]')].some((el) =>
      /tắt phê duyệt bài viết/i.test(el.innerText || ''),
    ),
    { timeout: 8000 },
  ).catch(() => {});
  await humanPause(400, 700);

  const action = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => ({
      el,
      label: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    }));
    const off = items.find((item) => /tắt phê duyệt bài viết/i.test(item.label) && !/bình luận/i.test(item.label));
    if (off) {
      off.el.click();
      return { kind: 'disable', label: off.label };
    }
    const on = items.find((item) => /bật phê duyệt bài viết|bật tính năng phê duyệt bài viết/i.test(item.label));
    if (on) {
      return { kind: 'already_off', label: on.label };
    }
    return { kind: 'unknown', labels: items.map((item) => item.label).filter(Boolean).slice(0, 20) };
  });

  return { ok: action.kind === 'disable' || action.kind === 'already_off', opened, action };
}

export async function disableMemberPostApproval({ member, uid, groupId, headed = false } = {}) {
  const gid = groupIdFromEnv(groupId);
  const userId = uidFromMember(member, uid);
  if (!userId) {
    return { ok: false, reason: 'missing_uid' };
  }

  let browser;
  let page;
  try {
    ({ browser, page } = await launchBrowserRetry({
      userDataDir: path.resolve(process.env.FB_USER_DATA_DIR || './data/chrome-profile'),
      headed,
    }));
  } catch (error) {
    return { ok: false, reason: error.message || 'browser_busy' };
  }

  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(45_000);

  try {
    const session = await ensureFacebookSession(page);
    if (!session.ok) {
      return { ok: false, reason: 'not-logged-in', shot: await screenshot(page, 'not-logged-in') };
    }

    await openMemberPage(page, gid, userId);
    let status = await page.evaluate(readRestrictionStatus);
    if (status.kind === 'off') {
      return { ok: true, reason: 'already_off', uid: userId, verified: status };
    }

    const clicked = await clickTurnOffFromPostMenu(page);
    if (!clicked.ok) {
      return {
        ok: false,
        reason: clicked.reason || clicked.action?.kind || 'toggle_not_found',
        uid: userId,
        opened: clicked.opened || null,
        action: clicked.action || null,
        before: status,
        shot: await screenshot(page, 'no-toggle'),
      };
    }

    if (clicked.action?.kind === 'disable') {
      await confirmIfAsked(page);
    }

    await openMemberPage(page, gid, userId);
    status = await page.evaluate(readRestrictionStatus);
    if (status.kind === 'off') {
      return {
        ok: true,
        reason: clicked.action?.kind === 'already_off' ? 'already_off' : 'disabled',
        uid: userId,
        opened: clicked.opened,
        action: clicked.action,
        verified: status,
      };
    }

    return {
      ok: false,
      reason: 'still_on',
      uid: userId,
      opened: clicked.opened,
      action: clicked.action,
      verified: status,
      shot: await screenshot(page, 'still-on'),
    };
  } catch (error) {
    return { ok: false, reason: error.message || 'disable_error' };
  } finally {
    if (browser) {
      await browser.close();
    }
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

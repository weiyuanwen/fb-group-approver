import { existsSync } from 'node:fs';
import { humanPause, humanType, screenshot } from './browser.js';

const LOGIN_HINTS = ['log in', 'đăng nhập', 'login', 'email or phone', 'email hoặc số điện thoại'];

export function parseMemberQuery(raw) {
  const input = String(raw || '').trim();
  if (!input) throw new Error('Thiếu --member (URL profile hoặc tên).');

  let url;
  try {
    url = new URL(input);
  } catch {
    return { kind: 'name', name: input, profileUrl: null, username: null, profileId: null };
  }

  if (!/facebook\.com$/i.test(url.hostname.replace(/^www\./, '')) && !/fb\.com$/i.test(url.hostname.replace(/^www\./, ''))) {
    return { kind: 'name', name: input, profileUrl: null, username: null, profileId: null };
  }

  const id = url.searchParams.get('id');
  const parts = url.pathname.split('/').filter(Boolean);
  const reserved = new Set(['profile.php', 'people', 'groups', 'pages', 'watch', 'reel', 'share']);
  const username = parts.find((p) => !reserved.has(p) && p !== 'profile.php') || null;

  return {
    kind: 'profile',
    name: username || id || input,
    profileUrl: `${url.origin}${url.pathname}${id ? `?id=${id}` : ''}`.replace(/\/$/, ''),
    username,
    profileId: id,
  };
}

export function memberRequestsUrl(groupId) {
  return `https://www.facebook.com/groups/${groupId}/member-requests`;
}

export async function isLoginPage(page) {
  const href = page.url();
  if (/\/login|checkpoint|two_step/i.test(href)) return true;
  const text = ((await page.evaluate(() => document.body?.innerText || '')) || '').toLowerCase();
  return LOGIN_HINTS.some((h) => text.includes(h)) && text.includes('facebook') && !/member-requests|pending/i.test(href);
}

export async function assertLoggedIn(page) {
  if (await isLoginPage(page)) {
    const shot = await screenshot(page, 'not-logged-in');
    throw new Error(`Chưa đăng nhập Facebook (checkpoint/login). Ảnh: ${shot}. Hãy npm run login trên máy cá nhân rồi copy data/chrome-profile lên VPS.`);
  }
}

async function findSearchBox(page) {
  const selectors = [
    'input[type="search"]',
    'input[placeholder*="Tìm" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Tìm" i]',
    'input[aria-label*="Search" i]',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

async function clickApproveInContext(page, query) {
  return page.evaluate((q) => {
    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const hayName = normalize(q.name);
    const hayUser = normalize(q.username || '');
    const hayId = normalize(q.profileId || '');

    const approveRe = /^(phê duyệt|approve|chấp nhận|accept)$/i;
    const buttons = [...document.querySelectorAll('div[role="button"], button, span[role="button"]')];

    const isApprove = (el) => {
      const label = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim();
      return approveRe.test(label);
    };

    const matchesPerson = (root) => {
      const html = root.innerHTML || '';
      const text = normalize(root.innerText);
      if (hayId && (html.includes(`profile.php?id=${hayId}`) || html.includes(`id=${hayId}`))) return true;
      if (hayUser && html.toLowerCase().includes(`facebook.com/${hayUser}`)) return true;
      if (hayName && text.includes(hayName)) return true;
      return false;
    };

    const approveButtons = buttons.filter(isApprove);
    if (approveButtons.length === 0) return { ok: false, reason: 'no-approve-button' };

    if (q.kind === 'name' || q.kind === 'profile') {
      for (const btn of approveButtons) {
        const card =
          btn.closest('[role="article"]') ||
          btn.closest('[role="listitem"]') ||
          btn.closest('div[data-visualcompletion]') ||
          btn.parentElement?.parentElement?.parentElement;
        if (card && matchesPerson(card)) {
          btn.click();
          return { ok: true, via: 'card-match' };
        }
      }
    }

    if (approveButtons.length === 1) {
      approveButtons[0].click();
      return { ok: true, via: 'single-result' };
    }

    return { ok: false, reason: 'ambiguous', count: approveButtons.length };
  }, query);
}

export async function approveMember(page, { groupId, member }) {
  const query = parseMemberQuery(member);
  const url = memberRequestsUrl(groupId);

  console.log(`[info] Mở ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  await humanPause(1200, 2200);
  await assertLoggedIn(page);

  if (!/member-requests|pending/i.test(page.url()) && !/groups\//.test(page.url())) {
    const shot = await screenshot(page, 'wrong-page');
    throw new Error(`Không vào được trang thành viên đang chờ. URL=${page.url()} ảnh=${shot}`);
  }

  const search = await findSearchBox(page);
  const searchText = query.kind === 'profile' ? query.username || query.profileId || query.name : query.name;

  if (search) {
    console.log(`[info] Gõ tìm kiếm: ${searchText}`);
    await search.click({ delay: 80 });
    await humanPause(250, 600);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await humanType(page, searchText);
    await page.keyboard.press('Enter');
    await humanPause(1500, 2800);
  } else {
    console.log('[warn] Không thấy ô tìm kiếm, duyệt danh sách hiện có.');
    await humanPause(800, 1500);
  }

  let result = await clickApproveInContext(page, query);
  if (!result.ok && search) {
    await humanPause(800, 1400);
    result = await clickApproveInContext(page, query);
  }

  if (!result.ok) {
    const shot = await screenshot(page, 'approve-failed');
    return {
      ok: false,
      query,
      reason: result.reason || 'not-found',
      detail: result,
      screenshot: shot,
    };
  }

  await humanPause(900, 1800);
  const shot = await screenshot(page, 'approve-ok');
  return { ok: true, query, via: result.via, screenshot: shot };
}

export function existsSession(dir) {
  return existsSync(dir);
}

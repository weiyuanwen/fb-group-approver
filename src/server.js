import 'dotenv/config';
import http from 'node:http';
import { disableMemberPostApproval } from './disable-post-approval.js';

const port = Number(process.env.FB_APPROVER_PORT || 4001);
const token = String(process.env.FB_APPROVER_TOKEN || '');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/disable-post-approval') {
    send(res, 404, { ok: false, reason: 'not_found' });
    return;
  }

  if (token) {
    const header = String(req.headers.authorization || '');
    if (header !== `Bearer ${token}`) {
      send(res, 401, { ok: false, reason: 'unauthorized' });
      return;
    }
  }

  try {
    const payload = await readBody(req);
    const result = await disableMemberPostApproval({
      member: payload.member,
      uid: payload.uid,
      name: payload.name,
      groupId: payload.group_id,
    });
    send(res, result.ok ? 200 : 422, result);
  } catch (error) {
    send(res, 500, { ok: false, reason: error.message || 'server_error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[fb-group-approver] listening on :${port}`);
});

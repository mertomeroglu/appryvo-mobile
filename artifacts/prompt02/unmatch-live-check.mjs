import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const api = 'https://api.appryvo.online';
const here = path.dirname(fileURLToPath(import.meta.url));
const session = JSON.parse((await fs.readFile(path.join(here, '.prompt02-session.json'), 'utf8')).replace(/^\uFEFF/, ''));

async function login(account) {
  const response = await fetch(api + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: account.email, password: account.password }),
  });
  return (await response.json()).data.accessToken;
}
async function call(token, method, route, body) {
  const response = await fetch(api + route, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, json };
}

const [aToken, bToken] = await Promise.all([login(session.a), login(session.b)]);
const [aMatches, bMatches, aHistory, bHistory, idempotentA, idempotentB] = await Promise.all([
  call(aToken, 'GET', '/api/matches'), call(bToken, 'GET', '/api/matches'),
  call(aToken, 'GET', `/api/matches/${session.matchId}/messages`), call(bToken, 'GET', `/api/matches/${session.matchId}/messages`),
  call(aToken, 'DELETE', `/api/matches/${session.matchId}`), call(bToken, 'DELETE', `/api/matches/${session.matchId}`),
]);

const errors = [];
const socket = io(api, { auth: { token: bToken }, extraHeaders: { Authorization: `Bearer ${bToken}` }, transports: ['websocket'] });
socket.on('conversation:error', (error) => errors.push(error));
socket.on('message:error', (error) => errors.push(error));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10_000);
  socket.on('connect', () => { clearTimeout(timer); resolve(); });
  socket.on('connect_error', reject);
});
socket.emit('join:conversation', session.matchId);
const sendAck = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 3000);
  socket.emit('message:send', {
    matchId: session.matchId, text: 'must-not-send-after-unmatch', messageType: 'TEXT', clientMessageId: `after-unmatch-${Date.now()}`,
  }, (ack) => { clearTimeout(timer); resolve(ack); });
});
await new Promise((resolve) => setTimeout(resolve, 500));
socket.disconnect();

const matchPresent = (response) => (response.json?.data || []).some((match) => match.id === session.matchId);
console.log(JSON.stringify({
  absentFromA: !matchPresent(aMatches),
  absentFromB: !matchPresent(bMatches),
  historyDeniedA: [403, 404].includes(aHistory.status),
  historyDeniedB: [403, 404].includes(bHistory.status),
  idempotentDeleteA: idempotentA.status === 200,
  idempotentDeleteB: idempotentB.status === 200,
  socketJoinDenied: errors.length > 0,
  socketSendDenied: sendAck?.status !== 'success',
}, null, 2));

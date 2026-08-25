import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(here, '..', 'prompt02', '.prompt02-session.json');
const session = JSON.parse((await fs.readFile(sessionPath, 'utf8')).replace(/^\uFEFF/, ''));
const port = Number(process.env.CDP_PORT || 9224);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error(`No debuggable WebView on ${port}`);

let id = 0;
const pending = new Map();
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  cdp.addEventListener('open', resolve, { once: true });
  cdp.addEventListener('error', reject, { once: true });
});
cdp.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const requestId = ++id;
  cdp.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 20_000);
    pending.set(requestId, { resolve, reject, timer });
  });
}

async function evaluate(expression, awaitPromise = false) {
  const value = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.text || 'CDP evaluation failed');
  return value.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(message);
}

async function navigate(route) {
  await evaluate(`(() => {
    history.pushState({}, '', ${JSON.stringify(route)});
    window.dispatchEvent(new PopStateEvent('popstate'));
    return location.pathname;
  })()`);
  await waitUntil(() => evaluate(`location.pathname === ${JSON.stringify(route)}`), `Route ${route} did not open`);
}

async function heap(label) {
  const usage = await send('Runtime.getHeapUsage');
  return { label, usedKb: Math.round(usage.usedSize / 1024), totalKb: Math.round(usage.totalSize / 1024) };
}

const mapCycles = [];
const mapHeap = [await heap('before')];
for (let cycle = 1; cycle <= 20; cycle += 1) {
  const started = performance.now();
  await navigate('/map');
  await waitUntil(() => evaluate(`Boolean(document.querySelector('.leaflet-container')?._leaflet_id)`), `Map did not mount in cycle ${cycle}`);
  const mountMs = performance.now() - started;
  await navigate('/discover');
  await waitUntil(() => evaluate(`document.querySelectorAll('.leaflet-container, .leaflet-tile').length === 0`), `Leaflet DOM leaked in cycle ${cycle}`);
  const residue = await evaluate(`({
    containers: document.querySelectorAll('.leaflet-container').length,
    tiles: document.querySelectorAll('.leaflet-tile').length,
    panes: document.querySelectorAll('[class*="leaflet-pane"]').length,
  })`);
  mapCycles.push({ cycle, mountMs: Number(mountMs.toFixed(2)), ...residue });
}
mapHeap.push(await heap('after20'));
await sleep(10_000);
mapHeap.push(await heap('settled20'));

const bLoginResponse = await fetch('https://api.appryvo.online/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ identifier: session.b.email, password: session.b.password }),
});
const bLogin = await bLoginResponse.json();
if (!bLoginResponse.ok || !bLogin?.data?.accessToken) throw new Error(`B stress login failed with ${bLoginResponse.status}`);
const bAccessToken = bLogin.data.accessToken;
const bSocketMetrics = { connects: 0, disconnects: 0, incoming: [], errors: [] };
const bSocket = io('https://api.appryvo.online', {
  auth: { token: bAccessToken },
  extraHeaders: { Authorization: `Bearer ${bAccessToken}` },
  transports: ['websocket'],
  reconnection: true,
});
bSocket.on('connect', () => { bSocketMetrics.connects += 1; });
bSocket.on('disconnect', () => { bSocketMetrics.disconnects += 1; });
bSocket.on('message:received', (message) => bSocketMetrics.incoming.push(message));
bSocket.on('connect_error', (error) => bSocketMetrics.errors.push(error.message));
await waitUntil(async () => bSocket.connected, 'B stress socket failed to connect');
bSocket.emit('join:conversation', session.matchId);

function bSend(text, clientMessageId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('B send acknowledgement timed out')), 15_000);
    bSocket.emit('message:send', { matchId: session.matchId, text, messageType: 'TEXT', clientMessageId }, (ack) => {
      clearTimeout(timer);
      if (ack?.status !== 'success') reject(new Error(`B send failed: ${JSON.stringify(ack)}`));
      else resolve(ack);
    });
  });
}

const chatHeap = [await heap('before')];
const chatCycles = [];
for (let cycle = 1; cycle <= 15; cycle += 1) {
  const started = performance.now();
  await navigate(`/chat/${session.matchId}`);
  await waitUntil(() => evaluate(`Boolean(document.querySelector('textarea[aria-label="Mesaj"]'))`), `Chat did not mount in cycle ${cycle}`);
  const openMs = performance.now() - started;
  // Allow the room-join acknowledgement and initial history query to settle before the
  // first peer message; this measures normal interactive use, not an artificial same-tick race.
  await sleep(400);

  const outgoingText = `qa-chat-cycle-a-${cycle}-${Date.now()}`;
  const outgoingBefore = bSocketMetrics.incoming.length;
  await evaluate(`(() => {
    const input = document.querySelector('textarea[aria-label="Mesaj"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(outgoingText)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const sendButton = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Gönder');
    sendButton?.click();
    return Boolean(sendButton);
  })()`);
  await waitUntil(async () => bSocketMetrics.incoming.some((item) => item.text === outgoingText), `B did not receive A message in cycle ${cycle}`);
  const outgoingCopies = bSocketMetrics.incoming.filter((item) => item.text === outgoingText).length;

  const incomingText = `qa-chat-cycle-b-${cycle}-${Date.now()}`;
  await bSend(incomingText, `cycle-b-${cycle}-${Date.now()}`);
  await waitUntil(() => evaluate(`document.body.innerText.includes(${JSON.stringify(incomingText)})`), `A did not render B message in cycle ${cycle}`);
  const incomingCopies = await evaluate(`document.body.innerText.split(${JSON.stringify(incomingText)}).length - 1`);

  await navigate('/messages');
  await waitUntil(() => evaluate(`!document.querySelector('textarea[aria-label="Mesaj"]')`), `Chat did not unmount in cycle ${cycle}`);
  chatCycles.push({ cycle, openMs: Number(openMs.toFixed(2)), outgoingCopies, incomingCopies, bEventsAdded: bSocketMetrics.incoming.length - outgoingBefore });
}
chatHeap.push(await heap('after15'));
await sleep(10_000);
chatHeap.push(await heap('settled15'));

bSocket.disconnect();
const result = {
  map: {
    cycles: mapCycles.length,
    residueCount: mapCycles.filter((item) => item.containers || item.tiles || item.panes).length,
    medianMountMs: [...mapCycles].sort((a, b) => a.mountMs - b.mountMs)[9].mountMs,
    heap: mapHeap,
  },
  chat: {
    cycles: chatCycles.length,
    duplicateIncomingCount: chatCycles.filter((item) => item.incomingCopies !== 1 || item.outgoingCopies !== 1).length,
    openFirstMs: chatCycles[0].openMs,
    openLastMs: chatCycles.at(-1).openMs,
    maxOpenMs: Math.max(...chatCycles.map((item) => item.openMs)),
    bSocket: bSocketMetrics,
    heap: chatHeap,
    cycleResults: chatCycles,
  },
};
console.log(JSON.stringify(result, null, 2));
cdp.close();

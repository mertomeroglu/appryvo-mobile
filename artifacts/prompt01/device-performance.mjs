import { execFileSync } from 'node:child_process';

const port = Number(process.env.CDP_PORT || 9224);
const serial = process.env.ADB_SERIAL || 'emulator-5554';
const adb = process.env.ADB || 'C:\\Users\\merto\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const packageName = 'com.appryvo.ryvo';
const swipeCount = Number(process.env.SWIPE_COUNT || 50);

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error(`No debuggable WebView on ${port}`);

let sequence = 0;
const pending = new Map();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 20_000);
    pending.set(id, { resolve, reject, timer });
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adbRun = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' });

function memorySnapshot(label) {
  const raw = adbRun('shell', 'dumpsys', 'meminfo', packageName);
  const total = raw.match(/TOTAL PSS:\s+(\d+)\s+TOTAL RSS:\s+(\d+)/);
  const graphics = raw.match(/^\s*Graphics:\s+(\d+)/m);
  const view = raw.match(/^\s*Views:\s+(\d+)/m);
  return {
    label,
    pssKb: total ? Number(total[1]) : null,
    rssKb: total ? Number(total[2]) : null,
    graphicsKb: graphics ? Number(graphics[1]) : null,
    views: view ? Number(view[1]) : null,
  };
}

async function topCard() {
  return evaluate(`(() => {
    const cards = [...document.querySelectorAll('.discovery-swipe-card')];
    const card = cards.find((node) => getComputedStyle(node).pointerEvents !== 'none');
    if (!card) return null;
    const image = card.querySelector('img');
    return {
      name: image?.alt || '',
      signature: image?.currentSrc || image?.src || '',
      ready: Boolean(image?.complete && image?.naturalWidth > 0),
      pointerEvents: getComputedStyle(card).pointerEvents,
      opacity: Number(getComputedStyle(card).opacity),
    };
  })()`);
}

async function waitForCard(previousSignature, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await topCard();
    if (current && current.signature && current.signature !== previousSignature && current.ready && current.pointerEvents !== 'none') {
      return current;
    }
    await sleep(8);
  }
  throw new Error(`Next card did not become interactive after ${previousSignature}`);
}

async function runSwipe(index) {
  const before = await topCard();
  if (!before?.name) throw new Error(`No controlled card at swipe ${index}`);
  const aria = index % 2 === 0 ? 'Geç' : 'Beğen';
  const started = performance.now();
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === ${JSON.stringify(aria)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`${aria} action unavailable at swipe ${index}`);
  const next = await waitForCard(before.signature);
  const latencyMs = performance.now() - started;
  let flash = false;
  for (let sample = 0; sample < 20; sample += 1) {
    await sleep(25);
    const observed = await topCard();
    if (observed?.signature === before.signature) flash = true;
  }
  return { index, direction: aria, from: before.name, fromSignature: before.signature, to: next.name, toSignature: next.signature, latencyMs: Number(latencyMs.toFixed(2)), oldCardFlash: flash };
}

function percentile(values, ratio) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1);
  return Number(ordered[index].toFixed(2));
}

adbRun('logcat', '-c');
adbRun('shell', 'dumpsys', 'gfxinfo', packageName, 'reset');
const memory = [memorySnapshot('before20')];
const swipes = [];
for (let index = 1; index <= swipeCount; index += 1) {
  swipes.push(await runSwipe(index));
  if (index === 20 && swipeCount > 20) {
    memory.push(memorySnapshot('after20'));
    await sleep(10_000);
    memory.push(memorySnapshot('settled20_before50'));
  }
}
memory.push(memorySnapshot(`after${swipeCount}`));
await sleep(12_000);
memory.push(memorySnapshot(`settled${swipeCount}`));

const logs = adbRun('logcat', '-d');
const fatalPatterns = logs.match(/FATAL EXCEPTION|OutOfMemoryError|chromium.*crash|SIGSEGV/gi) || [];
const gfx = adbRun('shell', 'dumpsys', 'gfxinfo', packageName);
const totalFrames = Number(gfx.match(/Total frames rendered:\s+(\d+)/)?.[1] || 0);
const jankyFrames = Number(gfx.match(/Janky frames:\s+(\d+)/)?.[1] || 0);
const latencies = swipes.slice(0, 20).map((item) => item.latencyMs);
const result = {
  measuredAt: new Date().toISOString(),
  swipeLatency20: { medianMs: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95) },
  oldCardFlashCount: swipes.filter((item) => item.oldCardFlash).length,
  uniqueOutgoingCards: new Set(swipes.map((item) => item.fromSignature)).size,
  duplicateOutgoingCards: swipes.length - new Set(swipes.map((item) => item.fromSignature)).size,
  memory,
  gfx: { totalFrames, jankyFrames, jankyPercent: totalFrames ? Number(((jankyFrames / totalFrames) * 100).toFixed(2)) : 0 },
  crashOrOomSignals: fatalPatterns.length,
  swipes,
};
console.log(JSON.stringify(result, null, 2));
socket.close();

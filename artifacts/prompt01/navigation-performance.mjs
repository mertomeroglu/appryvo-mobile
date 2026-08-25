const port = Number(process.env.CDP_PORT || 9224);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No debuggable Ryvo WebView');
let id = 0;
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
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function send(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function measure(route, readyExpression) {
  const started = performance.now();
  await evaluate(`history.pushState({}, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate')); true`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(readyExpression)) return Number((performance.now() - started).toFixed(2));
    await sleep(10);
  }
  throw new Error(`${route} readiness timed out`);
}
const definitions = [
  ['discover', '/discover', `Boolean(document.querySelector('.discovery-swipe-card'))`],
  ['profile', '/profile', `document.body.innerText.includes('Ryvo QA A')`],
  ['frames', '/frames', `document.body.innerText.includes('Profil Çerçeveleri')`],
  ['messages', '/messages', `Boolean(document.querySelector('input[placeholder="Sohbetlerde ara"]'))`],
];
const samples = Object.fromEntries(definitions.map(([name]) => [name, []]));
for (let round = 0; round < 5; round += 1) {
  for (const [name, route, ready] of definitions) samples[name].push(await measure(route, ready));
}
const medians = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return [name, sorted[Math.floor(sorted.length / 2)]];
}));
console.log(JSON.stringify({ samplesMs: samples, medianMs: medians }, null, 2));
socket.close();

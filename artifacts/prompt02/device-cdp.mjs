import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const session = JSON.parse((await fs.readFile(path.join(HERE, '.prompt02-session.json'), 'utf8')).replace(/^\uFEFF/, ''));
const cdpPort = Number(process.env.CDP_PORT || 9224);
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No debuggable Ryvo WebView found on port 9224');

let requestId = 0;
const pending = new Map();
const socket = new WebSocket(target.webSocketDebuggerUrl);

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
  });
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id);
  pending.delete(message.id);
  clearTimeout(item.timer);
  if (message.error) item.reject(new Error(message.error.message));
  else item.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed');
  return result.result?.value;
}

const mode = process.argv[2] || 'snapshot';
let result;

if (mode === 'snapshot') {
  result = await evaluate(`({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 8000),
    buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.innerText.trim(), aria: button.getAttribute('aria-label') })).filter((item) => item.text || item.aria),
    inputs: [...document.querySelectorAll('input,textarea')].map((input) => ({ name: input.name, type: input.type, placeholder: input.placeholder, valueLength: input.value.length })),
  })`);
} else if (mode === 'go-settings') {
  result = await evaluate(`(() => {
    history.pushState({}, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return location.href;
  })()`);
} else if (mode === 'go-chat') {
  const matchId = JSON.stringify(session.matchId);
  result = await evaluate(`(() => {
    history.pushState({}, '', '/chat/' + ${matchId});
    window.dispatchEvent(new PopStateEvent('popstate'));
    return location.href;
  })()`);
} else if (mode === 'go-route') {
  const route = JSON.stringify(process.argv[3] || '/discover');
  result = await evaluate(`(() => {
    history.pushState({}, '', ${route});
    window.dispatchEvent(new PopStateEvent('popstate'));
    return location.href;
  })()`);
} else if (mode === 'webrtc-snapshot') {
  result = await evaluate(`({
    resource: typeof window.__RYVO_WEBRTC_DEBUG__ === 'function' ? window.__RYVO_WEBRTC_DEBUG__() : null,
    mediaElements: [...document.querySelectorAll('video,audio')].map((element) => ({
      tag: element.tagName,
      activeTracks: element.srcObject?.getTracks?.().filter((track) => track.readyState === 'live').length || 0,
    })),
    text: document.body.innerText.slice(0, 1500),
  })`);
} else if (mode === 'cards') {
  result = await evaluate(`([...document.querySelectorAll('.discovery-swipe-card')].map((card) => ({
    name: card.querySelector('img')?.alt || '',
    pointerEvents: getComputedStyle(card).pointerEvents,
    opacity: getComputedStyle(card).opacity,
    transform: getComputedStyle(card).transform,
    moving: card.getAttribute('data-moving'),
    imageReady: Boolean(card.querySelector('img')?.complete && card.querySelector('img')?.naturalWidth > 0),
  })))`);
} else if (mode === 'verified-badge') {
  result = await evaluate(`({
    url: location.href,
    verifiedBadges: document.querySelectorAll('[aria-label="Verified"]').length,
    hasVerifiedCopy: document.body.innerText.includes('Doğrulandı'),
    activeCameraTracks: [...document.querySelectorAll('video')].reduce((count, video) => count + (video.srcObject?.getTracks?.().filter((track) => track.readyState === 'live').length || 0), 0),
  })`);
} else if (mode === 'network-offline') {
  await send('Network.enable');
  result = await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
} else if (mode === 'network-online') {
  await send('Network.enable');
  result = await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
} else if (mode === 'click') {
  const needle = JSON.stringify(process.argv.slice(3).join(' '));
  result = await evaluate(`(() => {
    const needle = ${needle}.toLocaleLowerCase('tr-TR');
    const element = [...document.querySelectorAll('button,a')].find((item) =>
      (item.innerText || '').trim().toLocaleLowerCase('tr-TR').includes(needle)
      || (item.getAttribute('aria-label') || '').toLocaleLowerCase('tr-TR').includes(needle)
    );
    if (!element) return { clicked: false, needle, text: document.body.innerText.slice(0, 2000) };
    element.click();
    return { clicked: true, label: (element.innerText || element.getAttribute('aria-label') || '').trim() };
  })()`);
} else if (mode === 'login-a' || mode === 'login-b') {
  const account = mode === 'login-b' ? session.b : session.a;
  const email = JSON.stringify(account.email);
  const password = JSON.stringify(account.password);
  result = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    if (!document.querySelector('input[name="username"]')) {
      const loginButton = [...document.querySelectorAll('button')].find((button) => ['Giriş Yap', 'Sign In'].includes((button.innerText || '').trim()));
      if (loginButton) loginButton.click();
      for (let i = 0; i < 40 && !document.querySelector('input[name="username"]'); i += 1) await wait(100);
    }
    const username = document.querySelector('input[name="username"]');
    const passwordInput = document.querySelector('input[name="password"]');
    if (!username || !passwordInput) return { submitted: false, text: document.body.innerText.slice(0, 2000) };
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue(username, ${email});
    setValue(passwordInput, ${password});
    const form = username.closest('form');
    form.requestSubmit();
    for (let i = 0; i < 120 && location.pathname.startsWith('/auth'); i += 1) await wait(100);
    return { submitted: true, url: location.href, text: document.body.innerText.slice(0, 2500) };
  })()`);
} else if (mode === 'target') {
  const targetName = JSON.stringify(session.b.label);
  result = await evaluate(`({
    url: location.href,
    hasTarget: document.body.innerText.includes(${targetName}),
    targetName: ${targetName},
    text: document.body.innerText.slice(0, 4000),
    images: [...document.images].map((image) => ({ alt: image.alt, src: image.currentSrc || image.src })).slice(0, 12),
  })`);
} else if (mode === 'match-modal') {
  result = await evaluate(`({
    url: location.href,
    hasNewMatch: document.body.innerText.includes('Yeni Eşleşme'),
    hasMessageCta: document.body.innerText.includes('Mesaj Yaz'),
    hasContinueCta: document.body.innerText.includes('Keşfe Devam Et'),
    text: document.body.innerText.slice(0, 3000),
  })`);
} else if (mode === 'chat-profile') {
  result = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => (item.getAttribute('aria-label') || '').includes('profilini aç'));
    if (!button) return { clicked: false, text: document.body.innerText.slice(0, 2000) };
    const label = button.getAttribute('aria-label');
    button.click();
    return { clicked: true, label };
  })()`);
} else if (mode === 'count-text') {
  const needle = JSON.stringify(process.argv.slice(3).join(' '));
  result = await evaluate(`(() => {
    const needle = ${needle};
    const text = document.body.innerText;
    return { url: location.href, needle, count: text.split(needle).length - 1, text: text.slice(-4000) };
  })()`);
} else {
  throw new Error(`Unknown device mode: ${mode}`);
}

console.log(JSON.stringify(result, null, 2));
socket.close();

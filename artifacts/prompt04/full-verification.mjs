import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const api = 'https://api.appryvo.online';
const here = path.dirname(fileURLToPath(import.meta.url));
const session = JSON.parse((await fs.readFile(path.join(here, '..', 'prompt02', '.prompt02-session.json'), 'utf8')).replace(/^\uFEFF/, ''));

async function request(method, route, token, body) {
  const response = await fetch(api + route, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

const login = await request('POST', '/api/auth/login', null, { identifier: session.a.email, password: session.a.password });
const token = login.data.accessToken;
const socketEvents = [];
const socket = io(api, {
  auth: { token },
  extraHeaders: { Authorization: `Bearer ${token}` },
  transports: ['websocket'],
});
socket.on('user:updated', (event) => socketEvents.push(event));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Verification observer socket timeout')), 12_000);
  socket.on('connect', () => { clearTimeout(timer); resolve(); });
  socket.on('connect_error', reject);
});

const totalStarted = performance.now();
const verificationSession = await request('POST', '/api/verification/session', token, {});
const challenges = verificationSession.data.challenges;
const fixturePaths = {
  CENTER: path.join(here, '..', 'prompt02', 'controlled-media', 'qa-a-01.png'),
  TURN_LEFT: path.join(here, 'qa-a-turn-left.png'),
  CENTER_RETURN: path.join(here, '..', 'prompt02', 'controlled-media', 'qa-a-01.png'),
  TURN_RIGHT: path.join(here, 'qa-a-turn-right-v2.png'),
  FINAL: path.join(here, '..', 'prompt02', 'controlled-media', 'qa-a-01.png'),
};

async function upload(filePath) {
  const bytes = await fs.readFile(filePath);
  const response = await request('POST', '/api/media/upload', token, {
    base64Data: bytes.toString('base64'),
    category: 'verification',
    mimeType: 'image/png',
  });
  return response.data.url;
}

const [selfieUrl, ...frameUrls] = await Promise.all([
  upload(fixturePaths.FINAL),
  ...challenges.map((challenge) => upload(fixturePaths[challenge])),
]);
const submitStarted = performance.now();
const decision = await request('POST', '/api/verification/submit', token, {
  sessionId: verificationSession.data.sessionId,
  selfieUrl,
  frames: challenges.map((challenge, index) => ({ challenge, imageUrl: frameUrls[index] })),
});
const decisionMs = performance.now() - submitStarted;

const socketDeadline = Date.now() + 5000;
while (!socketEvents.some((event) => event.reason === 'verification') && Date.now() < socketDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const me = await request('GET', '/api/me', token);
const result = {
  decision: decision.code,
  verified: decision.verified === true && me.data.verified === true,
  verificationState: me.data.verificationState,
  emailVerifiedStillSeparate: typeof me.data.emailVerified === 'boolean',
  userUpdatedLiveEvent: socketEvents.some((event) => event.reason === 'verification'),
  challengeSequence: challenges,
  deepFaceDecisionMs: Number(decisionMs.toFixed(1)),
  fullVerificationMs: Number((performance.now() - totalStarted).toFixed(1)),
};
console.log(JSON.stringify(result, null, 2));
socket.disconnect();

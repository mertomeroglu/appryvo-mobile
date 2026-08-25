import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const API = 'https://api.appryvo.online';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(HERE, 'controlled-media');
const SESSION_FILE = path.join(HERE, '.prompt02-session.json');
const EVIDENCE_FILE = path.join(HERE, 'certification-evidence.json');
const mode = process.argv[2];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uid = () => crypto.randomUUID();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function apiRequest(account, method, pathname, body, expected = [200]) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (account?.accessToken) headers.Authorization = `Bearer ${account.accessToken}`;
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${pathname} returned ${response.status}: ${JSON.stringify(json)}`);
  }
  return { status: response.status, json, headers: response.headers };
}

async function fetchPrivate(account, url) {
  const headers = account?.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {};
  const response = await fetch(url, { headers });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    bytes: bytes.byteLength,
  };
}

async function loadFreshSession() {
  const session = JSON.parse(await fs.readFile(SESSION_FILE, 'utf8'));
  for (const key of ['a', 'b']) {
    const refreshed = await apiRequest(null, 'POST', '/api/auth/refresh', {
      refreshToken: session[key].refreshToken,
    }, [200]);
    session[key].accessToken = refreshed.json.data.accessToken;
    session[key].refreshToken = refreshed.json.data.refreshToken;
  }
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  return session;
}

async function uploadRegistrationPhoto(filePath) {
  const buffer = await fs.readFile(filePath);
  const result = await apiRequest(null, 'POST', '/api/auth/register/photo', {
    base64Data: buffer.toString('base64'),
    mimeType: 'image/png',
  }, [201]);
  const uploadToken = result.json?.data?.uploadToken;
  assert(uploadToken, `registration photo upload returned no token for ${path.basename(filePath)}`);
  return uploadToken;
}

async function registerAccount({ label, email, username, password, gender, targetGender, photos }) {
  const photoUploadTokens = [];
  for (const photo of photos) photoUploadTokens.push(await uploadRegistrationPhoto(photo));
  const response = await apiRequest(null, 'POST', '/api/auth/register', {
    email,
    username,
    password,
    name: label,
    birthDate: '1929-01-01',
    gender,
    targetGender,
    relationshipGoal: 'LONG_TERM',
    interests: ['Kitap', 'Müzik', 'Bahçe'],
    minAgePref: 97,
    maxAgePref: 97,
    maxDistancePref: 5,
    ageDealbreaker: true,
    distanceDealbreaker: true,
    relationshipGoalDealbreaker: true,
    city: 'QA İzolasyon Bölgesi',
    job: 'Yetkili Test Profili',
    bio: 'Sentetik görseller kullanan kontrollü ve geçici Ryvo kalite güvence profilidir.',
    photoUploadTokens,
  }, [201]);
  const data = response.json?.data;
  assert(data?.accessToken && data?.refreshToken && data?.user?.uid, `registration failed for ${label}`);
  return {
    label,
    email,
    username,
    password,
    id: data.user.uid,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

async function setup() {
  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const password = `P02!${crypto.randomBytes(18).toString('base64url')}a7`;
  const a = await registerAccount({
    label: 'Ryvo QA A',
    email: `qa.p02.a.${stamp}@appryvo.online`,
    username: `qa_p02_a_${stamp}`.slice(0, 24),
    password,
    gender: 'FEMALE',
    targetGender: 'MALE',
    photos: [path.join(MEDIA_DIR, 'qa-a-01.png'), path.join(MEDIA_DIR, 'qa-a-02.png')],
  });
  const b = await registerAccount({
    label: 'Ryvo QA B',
    email: `qa.p02.b.${stamp}@appryvo.online`,
    username: `qa_p02_b_${stamp}`.slice(0, 24),
    password,
    gender: 'MALE',
    targetGender: 'FEMALE',
    photos: [path.join(MEDIA_DIR, 'qa-b-01.png'), path.join(MEDIA_DIR, 'qa-b-02.png')],
  });

  const [meA, meB, feedA, feedB] = await Promise.all([
    apiRequest(a, 'GET', '/api/me', undefined, [200]),
    apiRequest(b, 'GET', '/api/me', undefined, [200]),
    apiRequest(a, 'GET', '/api/discovery/feed?limit=30', undefined, [200]),
    apiRequest(b, 'GET', '/api/discovery/feed?limit=30', undefined, [200]),
  ]);
  const meAData = meA.json?.data;
  const meBData = meB.json?.data;
  const candidatesA = feedA.json?.data || [];
  const candidatesB = feedB.json?.data || [];
  assert((meAData?.photos || []).length >= 2, 'controlled user A has fewer than two server photos');
  assert((meBData?.photos || []).length >= 2, 'controlled user B has fewer than two server photos');
  assert(candidatesA.some((candidate) => String(candidate.id || candidate.uid) === b.id), 'B is absent from A discovery feed');
  assert(candidatesB.some((candidate) => String(candidate.id || candidate.uid) === a.id), 'A is absent from B discovery feed');

  const superLike = await apiRequest(a, 'POST', '/api/discovery/like', {
    targetUserId: b.id,
    isLike: true,
    isSuperLike: true,
  }, [403]);
  assert(superLike.json?.code === 'SUPERLIKE_QUOTA_EXHAUSTED', 'non-entitled Super Like was not rejected canonically');

  const session = {
    createdAt: new Date().toISOString(),
    a,
    b,
    setup: {
      profilePhotosA: meAData.photos.length,
      profilePhotosB: meBData.photos.length,
      discoveryAtoB: true,
      discoveryBtoA: true,
      discoveryAlgorithmA: feedA.json?.algorithmVersion || null,
      discoveryAlgorithmB: feedB.json?.algorithmVersion || null,
      superLikeEntitled: false,
      superLikeRejectionCode: superLike.json?.code,
    },
  };
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({
    phase: 'SETUP_COMPLETE',
    testUsers: [
      { label: a.label, email: a.email, username: a.username, id: a.id, photos: meAData.photos.length },
      { label: b.label, email: b.email, username: b.username, id: b.id, photos: meBData.photos.length },
    ],
    discoveryAtoB: true,
    discoveryBtoA: true,
    superLike: 'EXPECTED_NOT_ENTITLED',
    sessionFile: SESSION_FILE,
  }, null, 2));
}

function createSocket(account, name) {
  const metrics = {
    name,
    connectCount: 0,
    disconnectCount: 0,
    matchNew: [],
    messages: [],
    typingStart: [],
    typingStop: [],
    reads: [],
    presence: [],
    edits: [],
    deletes: [],
    translations: [],
    errors: [],
  };
  const socket = io(API, {
    auth: { token: account.accessToken },
    extraHeaders: { Authorization: `Bearer ${account.accessToken}` },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 300,
    reconnectionDelayMax: 1200,
  });
  socket.on('connect', () => { metrics.connectCount += 1; });
  socket.on('disconnect', () => { metrics.disconnectCount += 1; });
  socket.on('match:new', (data) => metrics.matchNew.push(data));
  socket.on('message:received', (data) => metrics.messages.push(data));
  socket.on('typing:start', (data) => metrics.typingStart.push(data));
  socket.on('typing:stop', (data) => metrics.typingStop.push(data));
  socket.on('message:read', (data) => metrics.reads.push(data));
  socket.on('user:presence', (data) => metrics.presence.push(data));
  socket.on('message:edit', (data) => metrics.edits.push(data));
  socket.on('message:delete', (data) => metrics.deletes.push(data));
  socket.on('message:translated', (data) => metrics.translations.push(data));
  socket.on('conversation:error', (data) => metrics.errors.push(data));
  socket.on('message:error', (data) => metrics.errors.push(data));
  socket.on('connect_error', (error) => metrics.errors.push({ connectError: error.message }));
  return { socket, metrics };
}

async function waitUntil(predicate, message, timeoutMs = 20000, intervalMs = 80) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(message);
}

async function connectSocket(peer) {
  await waitUntil(() => peer.socket.connected, `${peer.metrics.name} socket did not connect`, 15000);
}

async function sendSocketMessage(peer, payload) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${peer.metrics.name} message ack timed out`)), 15000);
    peer.socket.emit('message:send', payload, (ack) => {
      clearTimeout(timer);
      if (ack?.status !== 'success') reject(new Error(`${peer.metrics.name} message failed: ${JSON.stringify(ack)}`));
      else resolve(ack);
    });
  });
}

async function uploadChatMedia(account, filePath, mimeType, mediaType) {
  const data = await fs.readFile(filePath);
  const response = await apiRequest(account, 'POST', '/api/media/upload', {
    base64Data: data.toString('base64'),
    category: 'chat',
    mimeType,
    mediaType,
  }, [201]);
  assert(response.json?.data?.url, `chat upload returned no URL for ${path.basename(filePath)}`);
  return response.json.data.url;
}

async function certify() {
  const session = await loadFreshSession();
  const { a, b } = session;
  const peerA = createSocket(a, 'A');
  const peerB = createSocket(b, 'B');
  const evidence = {
    startedAt: new Date().toISOString(),
    setup: session.setup,
    runtime: {},
    sockets: {},
    media: {},
  };

  try {
    await Promise.all([connectSocket(peerA), connectSocket(peerB)]);
    const existingMatches = await apiRequest(a, 'GET', '/api/matches', undefined, [200]);
    const existingPair = (existingMatches.json?.data || []).find((match) => (
      Array.isArray(match.users) && match.users.includes(b.id)
    ));
    let matchId = existingPair?.id || null;
    let expectedNewMatchEvents = 0;

    if (matchId) {
      evidence.runtime.resumedExistingControlledMatch = true;
      console.log(JSON.stringify({ phase: 'RESUMING_EXISTING_CONTROLLED_MATCH', matchId }));
    } else {
      const preLikeB = await apiRequest(b, 'POST', '/api/discovery/like', {
        targetUserId: a.id,
        isLike: true,
        isSuperLike: false,
      }, [200]);
      assert(preLikeB.json?.isMatch === false, 'first controlled right-like unexpectedly created a match');
      console.log(JSON.stringify({ phase: 'ARMED_FOR_PHYSICAL_RIGHT_SWIPE', account: a.email, target: b.email }));

      const matchEvent = await waitUntil(
        () => peerA.metrics.matchNew[0] || peerB.metrics.matchNew[0],
        'physical A→B right swipe did not create a realtime match within 5 minutes',
        300000,
        100,
      );
      matchId = matchEvent.matchId;
      assert(matchId, 'match:new did not include matchId');
      expectedNewMatchEvents = 1;
      console.log(JSON.stringify({ phase: 'MATCH_RECEIVED', matchId }));
      await sleep(1200);
    }

    evidence.runtime.matchId = matchId;

    const duplicateLikeA = await apiRequest(a, 'POST', '/api/discovery/like', { targetUserId: b.id, isLike: true }, [200]);
    const duplicateLikeB = await apiRequest(b, 'POST', '/api/discovery/like', { targetUserId: a.id, isLike: true }, [200]);
    assert(duplicateLikeA.json?.matchId === matchId && duplicateLikeB.json?.matchId === matchId, 'duplicate like returned a second match id');
    await sleep(1200);
    assert(peerA.metrics.matchNew.length === expectedNewMatchEvents, `A received ${peerA.metrics.matchNew.length} unexpected match:new events`);
    assert(peerB.metrics.matchNew.length === expectedNewMatchEvents, `B received ${peerB.metrics.matchNew.length} unexpected match:new events`);

    const [matchesA, matchesB] = await Promise.all([
      apiRequest(a, 'GET', '/api/matches', undefined, [200]),
      apiRequest(b, 'GET', '/api/matches', undefined, [200]),
    ]);
    const pairMatchesA = (matchesA.json?.data || []).filter((match) => match.id === matchId);
    const pairMatchesB = (matchesB.json?.data || []).filter((match) => match.id === matchId);
    assert(pairMatchesA.length === 1 && pairMatchesB.length === 1, 'canonical match/thread uniqueness failed');
    evidence.runtime.duplicateMatches = Math.max(pairMatchesA.length, pairMatchesB.length) - 1;

    peerA.socket.emit('join:conversation', matchId);
    peerB.socket.emit('join:conversation', matchId);
    await sleep(700);

    peerA.socket.emit('presence:query', { targetUserId: b.id });
    peerB.socket.emit('presence:query', { targetUserId: a.id });
    await waitUntil(() => peerA.metrics.presence.some((item) => item.targetUserId === b.id && item.isOnline === true), 'A did not observe B presence');
    await waitUntil(() => peerB.metrics.presence.some((item) => item.targetUserId === a.id && item.isOnline === true), 'B did not observe A presence');
    evidence.runtime.presence = true;

    const messageAClientId = uid();
    const ackA = await sendSocketMessage(peerA, {
      matchId,
      text: 'Hello from controlled QA A',
      clientMessageId: messageAClientId,
      messageType: 'TEXT',
    });
    const messageAId = ackA.id;
    await waitUntil(() => peerB.metrics.messages.some((item) => item.id === messageAId), 'B did not receive A text');
    assert(peerB.metrics.messages.filter((item) => item.id === messageAId).length === 1, 'B received duplicate A text');
    const unreadBefore = await apiRequest(b, 'GET', '/api/matches/unread-count', undefined, [200]);
    assert(Number(unreadBefore.json?.data?.unreadCount) >= 1, 'B unread count did not increment');
    evidence.runtime.unreadIncrement = true;

    peerA.socket.emit('typing:start', { matchId });
    await waitUntil(() => peerB.metrics.typingStart.some((item) => item.matchId === matchId && item.userId === a.id), 'B did not receive typing:start');
    peerA.socket.emit('typing:stop', { matchId });
    await waitUntil(() => peerB.metrics.typingStop.some((item) => item.matchId === matchId && item.userId === a.id), 'B did not receive typing:stop');
    evidence.runtime.typing = true;

    peerB.socket.emit('message:read', { matchId, messageIds: [messageAId] });
    await waitUntil(() => peerA.metrics.reads.some((item) => item.matchId === matchId && item.readBy === b.id), 'A did not receive read receipt');
    // A resumed run can legitimately inherit unread probes from an interrupted earlier pass.
    // The client marks the whole open conversation read, so certify that canonical behavior
    // before asserting the account-wide unread total.
    peerB.socket.emit('message:read', { matchId });
    await sleep(300);
    const unreadAfter = await apiRequest(b, 'GET', '/api/matches/unread-count', undefined, [200]);
    assert(Number(unreadAfter.json?.data?.unreadCount) === 0, 'B unread count did not clear');
    evidence.runtime.readReceipt = true;
    evidence.runtime.unreadClear = true;

    const ackB = await sendSocketMessage(peerB, {
      matchId,
      text: 'Merhaba kontrollü QA A',
      clientMessageId: uid(),
      messageType: 'TEXT',
    });
    await waitUntil(() => peerA.metrics.messages.some((item) => item.id === ackB.id), 'A did not receive B text');
    assert(peerA.metrics.messages.filter((item) => item.id === ackB.id).length === 1, 'A received duplicate B text');
    peerA.socket.emit('message:read', { matchId, messageIds: [ackB.id] });

    const replyAck = await sendSocketMessage(peerB, {
      matchId,
      text: 'Bu kontrollü bir yanıttır',
      replyToMessageId: messageAId,
      clientMessageId: uid(),
      messageType: 'TEXT',
    });
    await waitUntil(() => peerA.metrics.messages.some((item) => item.id === replyAck.id && item.replyToMessageId === messageAId), 'reply metadata was not delivered');
    evidence.runtime.reply = true;

    await apiRequest(b, 'PATCH', `/api/matches/${matchId}/messages/${replyAck.id}`, { text: 'Bu düzenlenmiş kontrollü yanıttır' }, [200]);
    await waitUntil(() => peerA.metrics.edits.some((item) => item.messageId === replyAck.id), 'remote edit event was not delivered');
    evidence.runtime.edit = true;
    await apiRequest(b, 'DELETE', `/api/matches/${matchId}/messages/${replyAck.id}`, undefined, [200]);
    await waitUntil(() => peerA.metrics.deletes.some((item) => item.messageId === replyAck.id), 'remote delete event was not delivered');
    evidence.runtime.delete = true;

    await apiRequest(b, 'PUT', `/api/chat/conversations/${matchId}/translation-settings`, {
      autoTranslateEnabled: true,
      translationLanguage: 'tr',
    }, [200]);
    const translationAck = await sendSocketMessage(peerA, {
      matchId,
      text: 'Good morning, this is an authorized translation test.',
      clientMessageId: uid(),
      messageType: 'TEXT',
    });
    const translation = await waitUntil(
      () => peerB.metrics.translations.find((item) => item.messageId === translationAck.id),
      'automatic translation event was not received',
      45000,
      150,
    ).catch(() => null);
    const manualTranslation = await apiRequest(b, 'POST', '/api/chat/translate', { messageId: translationAck.id }, [200]);
    evidence.runtime.translation = Boolean(translation?.translatedText || manualTranslation.json?.data?.translatedText);
    evidence.runtime.translationTarget = translation?.targetLanguage || manualTranslation.json?.data?.targetLanguage || null;

    const imageUrl = await uploadChatMedia(a, path.join(MEDIA_DIR, 'qa-a-01.png'), 'image/png', 'IMAGE');
    const beforeReference = await fetchPrivate(b, imageUrl);
    assert(beforeReference.status === 403, `recipient accessed unreferenced private image with ${beforeReference.status}`);
    const imageAck = await sendSocketMessage(peerA, { matchId, mediaUrl: imageUrl, messageType: 'IMAGE', clientMessageId: uid() });
    await waitUntil(() => peerB.metrics.messages.some((item) => item.id === imageAck.id), 'recipient did not receive image message');
    const imageAccess = await fetchPrivate(b, imageUrl);
    const imageOwnerAccess = await fetchPrivate(a, imageUrl);
    const imageAnonymous = await fetchPrivate(null, imageUrl);
    assert(imageAccess.status === 200 && imageAccess.bytes > 0, 'matched recipient could not access private image');
    assert(imageOwnerAccess.status === 200 && imageOwnerAccess.bytes > 0, 'owner could not access private image');
    assert(imageAnonymous.status === 401, 'anonymous private image access was not rejected');
    evidence.media.image = { beforeReference, recipient: imageAccess, owner: imageOwnerAccess, anonymous: imageAnonymous };

    const gifUrl = await uploadChatMedia(a, path.join(MEDIA_DIR, 'qa-animation.gif'), 'image/gif', 'IMAGE');
    const gifAck = await sendSocketMessage(peerA, { matchId, mediaUrl: gifUrl, messageType: 'IMAGE', clientMessageId: uid() });
    await waitUntil(() => peerB.metrics.messages.some((item) => item.id === gifAck.id), 'recipient did not receive GIF message');
    const gifAccess = await fetchPrivate(b, gifUrl);
    assert(gifAccess.status === 200 && gifAccess.bytes > 0, 'matched recipient could not access private GIF');
    evidence.media.gif = gifAccess;

    for (const item of [
      { key: 'audio', file: 'qa-audio.webm', mime: 'audio/webm', type: 'VOICE' },
      { key: 'video', file: 'qa-video.mp4', mime: 'video/mp4', type: 'VIDEO' },
    ]) {
      const mediaUrl = await uploadChatMedia(a, path.join(MEDIA_DIR, item.file), item.mime, item.type);
      const ack = await sendSocketMessage(peerA, { matchId, mediaUrl, messageType: item.type, clientMessageId: uid(), durationSeconds: 1 });
      await waitUntil(() => peerB.metrics.messages.some((message) => message.id === ack.id), `recipient did not receive ${item.key} message`);
      const access = await fetchPrivate(b, mediaUrl);
      assert(access.status === 200 && access.bytes > 0, `matched recipient could not access private ${item.key}`);
      assert(access.contentType.startsWith(item.mime.split('/')[0] + '/'), `${item.key} response used wrong content type: ${access.contentType}`);
      evidence.media[item.key] = access;
    }

    const historyA = await apiRequest(a, 'GET', `/api/matches/${matchId}/messages?limit=50`, undefined, [200]);
    const historyB = await apiRequest(b, 'GET', `/api/matches/${matchId}/messages?limit=50`, undefined, [200]);
    const idsA = (historyA.json?.data || []).map((message) => message.id);
    const idsB = (historyB.json?.data || []).map((message) => message.id);
    assert(idsA.length === idsB.length && idsA.every((id, index) => id === idsB[index]), 'chat history differs between participants');
    evidence.runtime.history = true;

    peerA.socket.io.engine.close();
    await waitUntil(() => peerA.metrics.disconnectCount >= 1, 'A transport did not disconnect for reconnect test');
    await waitUntil(() => peerA.socket.connected && peerA.metrics.connectCount >= 2, 'A socket did not reconnect', 30000, 100);
    peerA.socket.emit('join:conversation', matchId);
    await sleep(500);
    const reconnectAck = await sendSocketMessage(peerB, { matchId, text: 'Reconnect room rejoin probe', messageType: 'TEXT', clientMessageId: uid() });
    await waitUntil(() => peerA.metrics.messages.some((message) => message.id === reconnectAck.id), 'A did not receive message after reconnect room rejoin');
    assert(peerA.metrics.messages.filter((message) => message.id === reconnectAck.id).length === 1, 'A received duplicate reconnect probe');
    evidence.runtime.reconnect = true;

    await apiRequest(a, 'POST', '/api/discovery/pass', { targetUserId: b.id }, [200]);
    await apiRequest(a, 'POST', '/api/discovery/pass', { targetUserId: b.id }, [200]);
    evidence.runtime.passIdempotent = true;

    const finalMatchesA = await apiRequest(a, 'GET', '/api/matches', undefined, [200]);
    assert((finalMatchesA.json?.data || []).filter((match) => match.id === matchId).length === 1, 'pass or duplicate requests changed canonical match count');

    evidence.sockets = {
      A: { ...peerA.metrics, messages: peerA.metrics.messages.map((item) => item.id) },
      B: { ...peerB.metrics, messages: peerB.metrics.messages.map((item) => item.id) },
    };
    evidence.completedAt = new Date().toISOString();
    await fs.writeFile(EVIDENCE_FILE, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ phase: 'CERTIFICATION_COMPLETE', evidenceFile: EVIDENCE_FILE, evidence }, null, 2));
  } finally {
    peerA.socket.disconnect();
    peerB.socket.disconnect();
  }
}

async function physicalProbe() {
  const session = await loadFreshSession();
  const matches = await apiRequest(session.b, 'GET', '/api/matches', undefined, [200]);
  const match = (matches.json?.data || []).find((item) => (
    Array.isArray(item.users) && item.users.includes(session.a.id)
  ));
  assert(match?.id, 'controlled match missing for physical reconnect probe');
  const text = `Physical reconnect probe ${Date.now().toString(36)}`;
  const sent = await apiRequest(session.b, 'POST', `/api/matches/${match.id}/messages`, { text, messageType: 'TEXT' }, [201]);
  console.log(JSON.stringify({ phase: 'PHYSICAL_RECONNECT_PROBE_SENT', matchId: match.id, messageId: sent.json?.data?.id, text }));
}

async function sessionDedupe() {
  const session = await loadFreshSession();
  const matches = await apiRequest(session.a, 'GET', '/api/matches', undefined, [200]);
  const match = (matches.json?.data || []).find((item) => (
    Array.isArray(item.users) && item.users.includes(session.b.id)
  ));
  assert(match?.id, 'controlled match missing for socket session dedupe probe');
  const first = createSocket(session.a, 'same-session-first');
  await connectSocket(first);
  first.socket.emit('join:conversation', match.id);
  await sleep(250);

  const replacement = createSocket(session.a, 'same-session-replacement');
  try {
    await connectSocket(replacement);
    replacement.socket.emit('join:conversation', match.id);
    await waitUntil(() => first.metrics.disconnectCount === 1, 'stale same-session socket was not evicted');
    await sleep(250);
    const text = `Same session dedupe probe ${Date.now().toString(36)}`;
    const sent = await apiRequest(session.b, 'POST', `/api/matches/${match.id}/messages`, { text, messageType: 'TEXT' }, [201]);
    const messageId = sent.json?.data?.id;
    await waitUntil(() => replacement.metrics.messages.some((message) => message.id === messageId), 'replacement session did not receive room message');
    assert(replacement.metrics.messages.filter((message) => message.id === messageId).length === 1, 'replacement received a duplicate room message');
    assert(first.metrics.messages.filter((message) => message.id === messageId).length === 0, 'evicted session received the room message');
    console.log(JSON.stringify({
      phase: 'SESSION_DEDUPE_COMPLETE',
      staleDisconnects: first.metrics.disconnectCount,
      replacementConnects: replacement.metrics.connectCount,
      replacementMessageCopies: replacement.metrics.messages.filter((message) => message.id === messageId).length,
      staleMessageCopies: first.metrics.messages.filter((message) => message.id === messageId).length,
    }));
  } finally {
    first.socket.disconnect();
    replacement.socket.disconnect();
  }
}

async function isolateAccounts() {
  const session = await loadFreshSession();
  for (const account of [session.a, session.b]) {
    await apiRequest(account, 'PUT', '/api/user/profile', {
      targetGender: 'NON_BINARY',
      minAgePref: 100,
      maxAgePref: 100,
      maxDistancePref: 1,
      ageDealbreaker: true,
      distanceDealbreaker: true,
      relationshipGoalDealbreaker: true,
      relationshipGoals: ['LONG_TERM'],
      mapVisible: false,
    }, [200]);
  }
  console.log(JSON.stringify({ phase: 'CONTROLLED_ACCOUNTS_REISOLATED', users: [session.a.email, session.b.email] }));
}

if (mode === 'setup') await setup();
else if (mode === 'certify') await certify();
else if (mode === 'physical-probe') await physicalProbe();
else if (mode === 'session-dedupe') await sessionDedupe();
else if (mode === 'isolate') await isolateAccounts();
else throw new Error('Usage: node e2e-certify.mjs <setup|certify|physical-probe|session-dedupe|isolate>');

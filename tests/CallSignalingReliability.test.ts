import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('RYVO PATCH 03 — call signaling reaches audio/video, not just the ring UI', () => {
  it('ICE candidates are queued (never attempted-and-discarded) until a remote description exists', () => {
    const source = read('src/services/call/webrtcService.ts');
    const addStart = source.indexOf('async addIceCandidate(');
    const flushStart = source.indexOf('private async flushPendingIceCandidates(');
    expect(addStart).toBeGreaterThan(-1);
    expect(flushStart).toBeGreaterThan(-1);

    const addBody = source.slice(addStart, flushStart);
    // Must check for a remote description, not just pc existing -- a peer connection can exist
    // (offer side) with no remote description yet.
    expect(addBody).toMatch(/!this\.pc \|\| !this\.pc\.remoteDescription/);
    expect(addBody).toContain('this.pendingRemoteIceCandidates.push(candidate)');
    // The old behavior silently dropped anything that failed instead of holding onto it --
    // guard against that regressing back in.
    expect(addBody).not.toMatch(/if \(!this\.pc\) return;\s*\n\s*try/);
  });

  it('every setRemoteDescription call site flushes the queue immediately after', () => {
    const source = read('src/services/call/webrtcService.ts');
    const setRemoteDescriptionCalls = [...source.matchAll(/\.setRemoteDescription\([^)]*\);/g)];
    // acceptOffer, setRemoteAnswer, acceptVideoUpgrade, confirmVideoUpgrade
    expect(setRemoteDescriptionCalls.length).toBe(4);
    for (const match of setRemoteDescriptionCalls) {
      const afterCall = source.slice(match.index! + match[0].length, match.index! + match[0].length + 200);
      expect(afterCall).toContain('this.flushPendingIceCandidates()');
    }
  });

  it('creating the callee peer preserves pre-accept candidates and hangup clears them', () => {
    const source = read('src/services/call/webrtcService.ts');
    const ensureBody = source.slice(source.indexOf('private async ensurePeerConnection('), source.indexOf('private async acquireLocalStream('));
    const hangupBody = source.slice(source.indexOf('hangup() {'));
    expect(ensureBody).not.toContain('this.pendingRemoteIceCandidates = []');
    expect(hangupBody).toContain('this.pendingRemoteIceCandidates = []');
  });

  it('aggregates split Unified Plan track events and emits a fresh stream wrapper', () => {
    const source = read('src/services/call/webrtcService.ts');
    const trackBody = source.slice(source.indexOf('pc.ontrack ='), source.indexOf('pc.onconnectionstatechange'));
    expect(trackBody).toContain("track.id === event.track.id");
    expect(trackBody).toContain('this.remoteStream.addTrack(event.track)');
    expect(trackBody).toContain('event.track.onended');
    expect(source).toContain('new MediaStream(this.remoteStream.getTracks())');
  });

  it('adds local tracks duplicate-safely and keeps voice capture camera-free', () => {
    const source = read('src/services/call/webrtcService.ts');
    expect(source).toContain("sender.track?.id === track.id");
    expect(source).toContain('if (!alreadyAdded) pc.addTrack(track, stream)');
    expect(source).toMatch(/video: video[\s\S]*: false/);
  });

  it('does not report ACTIVE until the peer connection reaches connected', () => {
    const callService = read('src/services/call/callService.ts');
    const realtimeSync = read('src/components/RealtimeSync.tsx');
    expect(callService).toContain("state === 'connected'");
    expect(callService).toContain("setCallStatus('ACTIVE')");
    expect(realtimeSync).toContain("setCallStatus('CONNECTING')");
    expect(realtimeSync.slice(realtimeSync.indexOf("call:answered"), realtimeSync.indexOf("call:ice-candidate"))).not.toContain(
      "setCallStatus('ACTIVE')"
    );
  });

  it('call signaling responses are registered in RealtimeSync (mounted eagerly at app start), not inside the lazy-loaded CallOverlay', () => {
    const realtimeSync = read('src/components/RealtimeSync.tsx');
    for (const event of ['call:answered', 'call:ice-candidate', 'call:ended', 'call:busy', 'call:renegotiate-offer', 'call:renegotiate-answer']) {
      expect(realtimeSync).toContain(`socketService.on('${event}'`);
    }
    // Disconnect must also release local media for whatever call was active -- the disconnected
    // device never receives the server's call:ended for its own dropped socket.
    const disconnectStart = realtimeSync.indexOf("socketService.on('disconnect'");
    const disconnectBody = realtimeSync.slice(disconnectStart, disconnectStart + 500);
    expect(disconnectBody).toContain('webrtcService.hangup()');

    const overlay = read('src/components/CallOverlay.tsx');
    for (const event of ['call:answered', 'call:ice-candidate', 'call:renegotiate-offer', 'call:renegotiate-answer', 'call:busy']) {
      expect(overlay).not.toContain(`socketService.on('${event}'`);
    }
    // CallOverlay must still own local/remote stream -> React state wiring (UI concern), even
    // though it no longer owns the signaling responses themselves.
    expect(overlay).toContain('webrtcService.onLocalStream = setLocalStream');
    expect(overlay).toContain('webrtcService.onRemoteStream = setRemoteStream');
  });

  it('AppShell still lazy-loads the CallOverlay UI itself (only the signaling plumbing moved, not the bundle-size intent)', () => {
    const appShell = read('src/app/AppShell.tsx');
    expect(appShell).toMatch(/lazy\(\(\) => import\(['"]\.\.\/components\/CallOverlay['"]\)/);
  });

  it('starting or accepting a call is re-entrant-safe against a fast double-tap', () => {
    const source = read('src/services/call/callService.ts');
    const startBody = source.slice(source.indexOf('async startOutgoingCall('), source.indexOf('async acceptIncomingCall('));
    const acceptBody = source.slice(source.indexOf('async acceptIncomingCall('), source.indexOf('endCall(reason'));

    expect(startBody).toContain('isProcessingCallAction');
    expect(startBody).toContain('useCallStore.getState().activeCall');
    expect(startBody).toMatch(/finally \{\s*isProcessingCallAction = false;/);

    expect(acceptBody).toContain('isProcessingCallAction');
    expect(acceptBody).toMatch(/finally \{\s*isProcessingCallAction = false;/);
  });
});

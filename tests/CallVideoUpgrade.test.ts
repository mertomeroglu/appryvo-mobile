import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('mid-call voice->video upgrade never disturbs the existing audio connection', () => {
  it('adds a fresh video track instead of reusing/replacing the audio sender', () => {
    const source = read('src/services/call/webrtcService.ts');
    const upgradeStart = source.indexOf('async upgradeToVideo(');
    const acceptStart = source.indexOf('async acceptVideoUpgrade(');
    const confirmStart = source.indexOf('async confirmVideoUpgrade(');
    expect(upgradeStart).toBeGreaterThan(-1);
    expect(acceptStart).toBeGreaterThan(-1);
    expect(confirmStart).toBeGreaterThan(-1);

    const upgradeBody = source.slice(upgradeStart, acceptStart);
    const acceptBody = source.slice(acceptStart, confirmStart);

    expect(upgradeBody).toContain('this.pc.addTrack(videoTrack, this.localStream)');
    expect(acceptBody).toContain('this.pc.addTrack(videoTrack, this.localStream)');
    // Renegotiation (a real new offer/answer), not the camera-flip path -- switchCamera above
    // uses replaceTrack precisely because it does NOT need a new m-line/renegotiation.
    expect(upgradeBody).toContain('this.pc.createOffer()');
    expect(acceptBody).toContain('this.pc.createAnswer()');
  });

  it('requester and peer both flip the call store to video only after their own local step succeeds', () => {
    const source = read('src/services/call/callService.ts');
    const requestStart = source.indexOf('async requestVideoUpgrade()');
    const incomingOfferStart = source.indexOf('async handleIncomingRenegotiateOffer(');
    const incomingAnswerStart = source.indexOf('async handleIncomingRenegotiateAnswer(');
    expect(requestStart).toBeGreaterThan(-1);
    expect(incomingOfferStart).toBeGreaterThan(-1);
    expect(incomingAnswerStart).toBeGreaterThan(-1);

    const requestBody = source.slice(requestStart, incomingOfferStart);
    const offerBody = source.slice(incomingOfferStart, incomingAnswerStart);

    expect(requestBody).toContain("useCallStore.getState().setCallType('video')");
    expect(offerBody).toContain("useCallStore.getState().setCallType('video')");
    // A failed camera acquisition on the accepting side must not end or fail the still-healthy
    // voice call -- only logs, no failCall()/endCall()/hangup() in the catch branch.
    const offerCatch = offerBody.slice(offerBody.indexOf('catch'));
    expect(offerCatch).not.toContain('failCall(');
    expect(offerCatch).not.toContain('.hangup()');
  });

  it('guards the requester against re-requesting on an already-video or non-active call', () => {
    const source = read('src/services/call/callService.ts');
    const body = source.slice(source.indexOf('async requestVideoUpgrade()'), source.indexOf('async handleIncomingRenegotiateOffer('));
    expect(body).toContain("call.type === 'video'");
    expect(body).toContain("call.status !== 'ACTIVE'");
  });

  it('RealtimeSync wires both renegotiation socket events (registered eagerly, not inside the lazy-loaded CallOverlay)', () => {
    const source = read('src/components/RealtimeSync.tsx');
    expect(source).toContain("socketService.on('call:renegotiate-offer'");
    expect(source).toContain("socketService.on('call:renegotiate-answer'");
    expect(source).toContain('offCallRenegotiateOffer()');
    expect(source).toContain('offCallRenegotiateAnswer()');

    const overlaySource = read('src/components/CallOverlay.tsx');
    expect(overlaySource).not.toContain("socketService.on('call:renegotiate-offer'");
  });

  it('CallOverlay exposes a request-video control only on active voice calls', () => {
    const source = read('src/components/CallOverlay.tsx');
    expect(source).toContain('handleRequestVideo');
    expect(source).toMatch(/!isVideoCall && activeCall\.status === 'ACTIVE'/);
  });
});

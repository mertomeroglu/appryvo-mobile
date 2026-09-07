import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FACE_LIVENESS_CONFIG, expectedYawDirection, interpretYawForPreview, measureFace, smoothYaw } from '../src/services/verification/faceLiveness';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function face(noseX = 0.5, roll = 0) {
  const points = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  points[10] = { ...points[10], x: 0.3, y: 0.3 };
  points[20] = { ...points[20], x: 0.7, y: 0.7 };
  points[33] = { ...points[33], x: 0.4, y: 0.45 };
  points[263] = { ...points[263], x: 0.6, y: 0.45 + roll * 0.2 };
  points[1] = { ...points[1], x: noseX, y: 0.52 };
  return points as any;
}

describe('Point-Fix V9 liveness', () => {
  it('accepts a centered neutral face', () => expect(measureFace([face()]).guidance).toBe('READY'));
  it('rejects multiple faces', () => expect(measureFace([face(), face()]).guidance).toBe('MULTIPLE_FACES'));
  it('uses calibrated centering and roll tolerances', () => {
    expect(FACE_LIVENESS_CONFIG.centerTolerance).toBe(0.28);
    expect(FACE_LIVENESS_CONFIG.maxRollSlope).toBe(0.35);
  });
  it('maps physical left/right in unmirrored detector coordinates', () => {
    expect(expectedYawDirection('TURN_LEFT')).toBe(-1);
    expect(expectedYawDirection('TURN_RIGHT')).toBe(1);
  });
  it('inverts detector yaw only for mirrored presentation semantics', () => {
    expect(interpretYawForPreview(0.2, true)).toBe(-0.2);
    expect(interpretYawForPreview(0.2, false)).toBe(0.2);
  });
  it('median smoothing ignores one jitter frame', () => expect(smoothYaw([0.2, 0.21, -0.8, 0.22, 0.23])).toBe(0.21));
});

describe('Point-Fix V9 client contracts', () => {
  // Liking or matching with someone used to delete their marker, client-side here and in the map
  // query on the server. That belongs to the swipe deck, which is a one-pass queue; the map
  // answers "who is around me", and it made the map shrink permanently as people used it --
  // including for two testers who match and then cannot see each other. Both surfaces now only
  // refetch, so the marker can pick up any state the interaction changed. Asserted negatively so
  // the removal cannot quietly return.
  it('refreshes but never removes map users after a like', () => {
    const hooks = source('src/hooks/useQueries.ts');
    expect(hooks).not.toContain("setQueriesData<any[]>({ queryKey: ['discovery', 'map'] }");
    expect(hooks).toContain("invalidateQueries({ queryKey: ['discovery', 'map'] })");
  });
  it('keeps matched users on the map instead of splicing them out in realtime', () => {
    const map = source('src/features/map/SocialMapScreen.tsx');
    const handlerStart = map.indexOf("socketService.on('match:new'");
    expect(handlerStart).toBeGreaterThan(-1);
    const matchHandler = map.slice(handlerStart, handlerStart + 400);
    expect(matchHandler).toContain("invalidateQueries({ queryKey: ['discovery', 'map'] })");
    expect(matchHandler).not.toContain('setQueriesData');
  });
  it('shares wallet and Coin store across profile surfaces', () => {
    expect(source('src/features/profile/OwnProfileScreen.tsx')).toContain('useWalletQuery');
    expect(source('src/features/profile/SettingsScreen.tsx')).toContain('CoinStoreSheet');
  });
  it('uses Coin frame purchase instead of direct frame IAP', () => {
    const frames = source('src/features/frames/ProfileFramesScreen.tsx');
    expect(frames).toContain('/purchase/coin');
    expect(frames).not.toContain('purchaseFrame(');
  });
  it('sets callee remote description before attaching local tracks', () => {
    const rtc = source('src/services/call/webrtcService.ts');
    const accept = rtc.slice(rtc.indexOf('async acceptOffer'), rtc.indexOf('private addLocalTracks'));
    expect(accept.indexOf('setRemoteDescription')).toBeLessThan(accept.indexOf('addLocalTracks'));
  });
  // Superseded: binding the tone to outgoing-only meant an incoming call was silent whenever the
  // app was already open, since the FCM notification's sound only covers the backgrounded case.
  // Both sides now ring while RINGING; the roles are still distinguished, by volume.
  it('rings on both sides of a RINGING call, louder for the callee', () => {
    const overlay = source('src/components/CallOverlay.tsx');
    expect(overlay).toContain("const ringing = activeCall?.status === 'RINGING';");
    expect(overlay).toContain("ringbackTone.start(activeCall.direction === 'incoming' ? 0.85 : 0.22)");
    expect(overlay).toContain('else ringbackTone.stop();');
  });
  it('uses a bundled neutral ringback asset', () => {
    expect(source('src/services/call/ringbackTone.ts')).toContain("/audio/ringback.wav");
    expect(existsSync(resolve(process.cwd(), 'public/audio/ringback.wav'))).toBe(true);
  });
  it('implements draggable snapping PiP', () => {
    const overlay = source('src/components/CallOverlay.tsx');
    expect(overlay).toContain('onPointerMove={movePip}');
    expect(overlay).toContain('finishPipDrag');
  });
  it('configures all supported iOS localizations', () => {
    const plist = source('ios/App/App/Info.plist');
    for (const locale of ['tr', 'en', 'es', 'fr', 'pt', 'ru', 'ar', 'hi', 'zh']) expect(plist).toContain(`<string>${locale}</string>`);
  });
});

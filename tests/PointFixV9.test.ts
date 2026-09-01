import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  it('removes and invalidates map users after like', () => {
    const hooks = source('src/hooks/useQueries.ts');
    expect(hooks).toContain("setQueriesData<any[]>({ queryKey: ['discovery', 'map'] }");
    expect(hooks).toContain("invalidateQueries({ queryKey: ['discovery', 'map'] })");
  });
  it('removes matched users from the map in realtime', () => expect(source('src/components/RealtimeSync.tsx')).toContain('payload.matchedUserId'));
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
  it('binds ringback strictly to outgoing RINGING', () => expect(source('src/components/CallOverlay.tsx')).toContain("activeCall?.direction === 'outgoing' && activeCall.status === 'RINGING'"));
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

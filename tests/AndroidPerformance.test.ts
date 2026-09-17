import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', 'src');
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Android performance contracts', () => {
  it('does not import the WebRTC overlay until a call exists', () => {
    const shell = source('app/AppShell.tsx');
    expect(shell).toContain('state.activeCall !== null');
    expect(shell).toContain('if (!hasActiveCall) return null');
    expect(shell).toContain('<CallOverlayGate />');
  });

  it('keeps the social confession feed out of the initial Messages chunk', () => {
    const messages = source('features/chat/MessagesScreen.tsx');
    expect(messages).toContain("lazy(() => import('../social/ConfessionsScreen')");
    expect(messages).toContain('<Suspense fallback=');
    expect(messages).not.toContain("import { ConfessionsScreen } from '../social/ConfessionsScreen'");
  });

  it('avoids duplicate profile reconciliation on authenticated startup', () => {
    const discover = source('features/discovery/DiscoverScreen.tsx');
    const realtime = source('components/RealtimeSync.tsx');
    expect(discover).not.toContain('useMeQuery');
    expect(discover).toContain('useAuthStore((state)');
    expect(realtime).toMatch(/if \(hasConnectedBeforeRef\.current\)[\s\S]*?reconcileProfile\(\)/);
  });

  it('bounds composited Discover cards and removes moving backdrop filters', () => {
    const discover = source('features/discovery/DiscoverScreen.tsx');
    const card = source('features/discovery/SwipeCard.tsx');
    // The swipe deck (which used to bound its own composited stack with .slice(-1)) is gone:
    // the question flow renders exactly one profile, and AnimatePresence mode="wait" keeps it
    // that way -- the outgoing card is fully removed before the next one mounts.
    expect(discover).toContain('<AnimatePresence mode="wait" initial={false}>');
    expect(discover).not.toContain('SwipeCard');
    expect(card).toContain('discovery-swipe-card');
    expect(card).not.toContain('backdrop-blur');
    expect(card).toContain('failedPhotos.has(currentPhoto)');
  });

  it('removes routine socket logging from production builds', () => {
    const socket = source('services/socket/socketService.ts');
    expect(socket).toContain('const DEBUG = import.meta.env.DEV');
    expect(socket).toContain("if (DEBUG) console.log('[SOCKET CONNECTED]");
    expect(socket).toContain("if (DEBUG) console.warn('[SOCKET CONNECT ERROR]");
  });

  it('releases Android map, recording, call, and compositing resources', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    const chat = source('features/chat/ChatScreen.tsx');
    const call = source('components/CallOverlay.tsx');
    // Call signaling responses, including disconnect cleanup, are registered in RealtimeSync
    // (mounted eagerly at app start) rather than the lazy-loaded CallOverlay -- see
    // CallSignalingReliability.test.ts for the full reasoning.
    const realtimeSync = source('components/RealtimeSync.tsx');
    const webrtc = source('services/call/webrtcService.ts');
    const styles = source('styles/globals.css');
    expect(map).toContain("container?.querySelectorAll('img')");
    expect(map).toContain('container?.replaceChildren()');
    expect(map).toContain('maxTileCacheSize: 50');
    expect(chat).toContain("recorder.state !== 'inactive'");
    expect(chat).toContain('stopMediaStream(recorder.stream)');
    expect(call).toContain('webrtcService.hangup()');
    expect(realtimeSync).toContain("socketService.on('disconnect'");
    expect(realtimeSync).toContain('webrtcService.hangup()');
    expect(webrtc).toContain('requestId !== this.mediaRequestId');
    expect(webrtc).toContain('activeLocalTracks:');
    expect(webrtc).toContain('hasPeerConnection: this.pc !== null');
    expect(styles).toContain("html[data-platform='android'] [class*='backdrop-blur']");
    expect(styles).toContain(".discovery-swipe-card[data-moving='true']");
  });
});

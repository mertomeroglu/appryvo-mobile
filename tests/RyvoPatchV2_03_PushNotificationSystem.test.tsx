import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('RYVO PATCH V2 03/05 -- iOS pushes use a real FCM-compatible token, not a raw APNs token', () => {
  it('native/push.ts acquires its token via @capacitor-firebase/messaging, not @capacitor/push-notifications', () => {
    const source = readSource('src/native/push.ts');
    expect(source).toMatch(/from '@capacitor-firebase\/messaging'/);
    expect(source).not.toMatch(/from '@capacitor\/push-notifications'/);
    // getToken() is what performs the real APNs->FCM exchange on iOS via Firebase's native SDK.
    expect(source).toMatch(/FirebaseMessaging\.getToken\(\)/);
  });

  it('package.json no longer declares the Firebase-less push-notifications plugin', () => {
    const pkg = JSON.parse(readSource('package.json'));
    expect(pkg.dependencies).not.toHaveProperty('@capacitor/push-notifications');
    expect(pkg.dependencies).toHaveProperty('@capacitor-firebase/messaging');
  });

  it('the iOS Podfile links CapacitorFirebaseMessaging instead of the old push-notifications pod', () => {
    const podfile = readSource('ios/App/Podfile');
    expect(podfile).not.toMatch(/CapacitorPushNotifications/);
    expect(podfile).toMatch(/CapacitorFirebaseMessaging/);
  });

  it('Info.plist declares UIBackgroundModes remote-notification for background push handling', () => {
    const infoPlist = readSource('ios/App/App/Info.plist');
    expect(infoPlist).toMatch(/<key>UIBackgroundModes<\/key>/);
    expect(infoPlist).toMatch(/<string>remote-notification<\/string>/);
  });

  it('RealtimeSync no longer imports types from the removed push-notifications plugin', () => {
    const source = readSource('src/components/RealtimeSync.tsx');
    expect(source).not.toMatch(/from '@capacitor\/push-notifications'/);
    expect(source).toMatch(/NotificationTapEvent/);
    expect(source).toMatch(/NotificationReceivedPayload/);
  });
});

describe('RYVO PATCH V2 03/05 -- stale token cleanup on refresh', () => {
  it('registering a changed token deactivates the previous one instead of leaving it active forever', () => {
    const source = readSource('src/services/push/pushRegistrationService.ts');
    const fnStart = source.indexOf('async registerToken(');
    const fnBody = source.slice(fnStart, source.indexOf('async ensureCurrentUser('));
    expect(fnBody).toMatch(/const staleToken = tokenChanged \? current\?\.token : null/);
    expect(fnBody).toMatch(/apiClient\.delete\('\/api\/devices\/push-token', \{ token: staleToken \}\)/);
  });
});

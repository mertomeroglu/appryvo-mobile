import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = readFileSync(resolve(__dirname, '..', 'ios', 'App', 'App', 'PrivacyInfo.xcprivacy'), 'utf8');
const pbxproj = readFileSync(resolve(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');

const collectedTypes = [...manifest.matchAll(/<string>(NSPrivacyCollectedDataType[A-Za-z]+)<\/string>/g)]
  .map((m) => m[1])
  .filter((t) => !t.startsWith('NSPrivacyCollectedDataTypePurpose'));

// Static validation only: the manifest is not exercised on an iOS runtime here.
describe('iOS privacy manifest', () => {
  it('declares no tracking and is bundled as an app resource', () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    expect(pbxproj).toMatch(/PrivacyInfo\.xcprivacy in Resources/);
  });

  it('declares the data the app actually collects', () => {
    for (const type of [
      'Name', 'EmailAddress', 'UserID', 'PreciseLocation', 'CoarseLocation', 'SensitiveInfo',
      'PhotosorVideos', 'AudioData', 'EmailsOrTextMessages', 'OtherUserContent', 'CustomerSupport',
      'PurchaseHistory', 'ProductInteraction', 'DeviceID', 'CrashData', 'AdvertisingData',
    ]) {
      expect(collectedTypes).toContain(`NSPrivacyCollectedDataType${type}`);
    }
    expect(new Set(collectedTypes).size).toBe(collectedTypes.length);
    // Every collected entry is marked as not used for tracking.
    expect(manifest.match(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/g)?.length).toBe(collectedTypes.length);
  });

  it('gives a required reason for UserDefaults (@capacitor/preferences)', () => {
    expect(manifest).toMatch(
      /NSPrivacyAccessedAPICategoryUserDefaults<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>CA92\.1<\/string>/,
    );
  });
});

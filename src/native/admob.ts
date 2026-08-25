import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, type AdMobRewardItem } from '@capacitor-community/admob';

// Google's own published TEST ad unit IDs (https://developers.google.com/admob/android/test-ads
// / .../ios/test-ads) -- safe to ship in debug/dev builds. See AndroidManifest.xml's
// com.google.android.gms.ads.APPLICATION_ID and Info.plist's GADApplicationIdentifier for the
// matching TEST app IDs. CONFIG REQUIRED before any release build: swap all four (2 app IDs, 2
// ad unit IDs below) for the real values from the AdMob console -- there is no existing secure
// config source for them yet, and this app-side code must never invent production identifiers.
const TEST_REWARDED_AD_UNIT_ID = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
};

let initPromise: Promise<void> | null = null;

function rewardedAdUnitId(): string {
  return Capacitor.getPlatform() === 'ios' ? TEST_REWARDED_AD_UNIT_ID.ios : TEST_REWARDED_AD_UNIT_ID.android;
}

export const nativeAdMob = {
  /** Idempotent -- safe to call from multiple mount points; only the first call does anything. */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!initPromise) {
      initPromise = (async () => {
        await AdMob.initialize({ initializeForTesting: import.meta.env.DEV === true });
        try {
          // CMP (Google UMP) consent flow -- required before ad requests for EEA/UK users.
          // A failure here must never block the rest of the app; it only means ads stay
          // unavailable until consent can be resolved on a future app open.
          const consentInfo = await AdMob.requestConsentInfo();
          if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
            await AdMob.showConsentForm();
          }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[ADMOB CONSENT]', err);
        }
      })();
    }
    return initPromise;
  },

  /**
   * Shows a rewarded video ad bound to an already-created server reward_sessions row (see
   * POST /api/ads/reward-session/init) via AdMob's Server-Side Verification. The returned
   * client-side reward signal is UX-only -- the actual credit is granted only once Google's SSV
   * callback has independently verified completion server-side
   * (POST /api/ads/reward-session/verify polls that authoritative state), never from this
   * client-side event alone.
   */
  async showRewardedAd(userId: string, ssvCustomData: string): Promise<AdMobRewardItem> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Ödüllü reklamlar yalnızca iOS veya Android uygulamasında kullanılabilir.');
    }
    await this.initialize();
    await AdMob.prepareRewardVideoAd({
      adId: rewardedAdUnitId(),
      isTesting: import.meta.env.DEV === true,
      ssv: { userId, customData: ssvCustomData },
    });
    return await AdMob.showRewardVideoAd();
  },
};

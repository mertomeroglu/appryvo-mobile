import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, type AdMobRewardItem } from '@capacitor-community/admob';
import { translateSync } from '../i18n/appLocale';

// Production AdMob Rewarded Ad Unit IDs
export const PRODUCTION_REWARDED_AD_UNIT_ID = {
  android: 'ca-app-pub-5522488293762480/8194082104',
  ios: 'ca-app-pub-5522488293762480/8245338986',
} as const;

// Google Published Sample Test Ad Unit IDs (used exclusively in dev/test mode)
export const TEST_REWARDED_AD_UNIT_ID = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
} as const;

let initPromise: Promise<void> | null = null;

export function isDevEnvironment(): boolean {
  return import.meta.env.DEV === true || import.meta.env.MODE === 'development';
}

export function rewardedAdUnitId(): string {
  const isDev = isDevEnvironment();
  const platform = Capacitor.getPlatform();
  const adUnitMap = isDev ? TEST_REWARDED_AD_UNIT_ID : PRODUCTION_REWARDED_AD_UNIT_ID;
  return platform === 'ios' ? adUnitMap.ios : adUnitMap.android;
}

export const nativeAdMob = {
  /** Idempotent -- safe to call from multiple mount points; only the first call does anything. */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!initPromise) {
      initPromise = (async () => {
        const isDev = isDevEnvironment();
        await AdMob.initialize({ initializeForTesting: isDev });
        try {
          // CMP (Google UMP) consent flow -- required before ad requests for EEA/UK users.
          // A failure here must never block the rest of the app; it only means ads stay
          // unavailable until consent can be resolved on a future app open.
          const consentInfo = await AdMob.requestConsentInfo();
          if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
            await AdMob.showConsentForm();
          }
        } catch (err) {
          if (isDev) console.warn('[ADMOB CONSENT]', err);
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
      throw new Error(translateSync('admobRewardedAdNativeOnlyError'));
    }
    await this.initialize();
    const isDev = isDevEnvironment();
    await AdMob.prepareRewardVideoAd({
      adId: rewardedAdUnitId(),
      isTesting: isDev,
      ssv: { userId, customData: ssvCustomData },
    });
    return await AdMob.showRewardVideoAd();
  },
};

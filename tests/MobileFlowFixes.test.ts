import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPhotoUrl } from '../src/services/media/mediaService';
import { messages } from '../src/i18n/appLocale';
import { PUBLIC_PLAN_NAMES } from '../src/features/premium/subscriptionProducts';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');

describe('mobile onboarding and discovery flow contracts', () => {
  it('uses one two-photo rule and completes registration from the photo step', () => {
    const wizard = source('features/auth/RegistrationWizard.tsx');
    const steps = source('features/auth/registrationSteps.ts');

    expect(wizard).toContain('const MIN_PHOTOS = 2');
    expect(wizard).toContain("t('minPhotosRequirementMessage')");
    expect(messages.tr.minPhotosRequirementMessage).toBe('Devam etmek için en az 2 profil fotoğrafı eklemelisin.');
    expect(wizard).toContain("t('photosUploadedCountTemplate').replace('{count}', String(uploadedPhotoCount)).replace('{min}', String(MIN_PHOTOS))");
    expect(messages.tr.photosUploadedCountTemplate).toBe('{count}/{min} fotoğraf yüklendi');
    expect(wizard).toContain('disabled={uploadedPhotoCount < MIN_PHOTOS}');
    expect(wizard).toContain('onClick={handleCreateAccount}');
    expect(steps).not.toContain("id: 'location'");
  });

  it('persists uploaded URLs and verifies the authoritative profile before completion', () => {
    const wizard = source('features/auth/RegistrationWizard.tsx');

    expect(wizard).toContain('mediaService.uploadRegistrationPhoto(blob)');
    expect(wizard).toContain('photoUploadTokens');
    expect(wizard).toContain('await fetchMe()');
    expect(wizard).not.toContain("apiClient.put('/api/profile', { photos: uploadedUrls }");
  });

  it('requests device location in Discover and retains a global fallback', () => {
    const discover = source('features/discovery/DiscoverScreen.tsx');

    expect(discover).toContain("nativeLocation.getCurrentPosition");
    expect(discover).toContain('latitude: lat');
    expect(discover).toContain('longitude: lng');
    expect(discover).not.toContain("apiClient.post('/api/user/location', { lat, lng })");
    expect(discover).toContain("t('discoverContinueGlobalAction')");
    expect(messages.tr.discoverContinueGlobalAction).toBe('Global Keşfet ile Devam Et');
    expect(discover).toContain('onClick={continueWithGlobalDiscovery}');
    expect(discover).not.toContain('Yukarı kaydırarak Süper Beğeni gönderebilirsin.');
  });

  it('keeps confession submit idempotent and surfaces empty-content validation', () => {
    const confessions = source('features/social/ConfessionsScreen.tsx');

    expect(confessions).toContain('if (createInFlightRef.current) return');
    expect(confessions).toContain('if (!cleanText)');
    expect(confessions).toContain('disabled={createConfession.isPending}');
    expect(confessions).not.toContain('disabled={createConfession.isPending || !text.trim()}');
  });
});

describe('profile and monetization UI contracts', () => {
  it('normalizes every profile-photo response shape', () => {
    expect(getPhotoUrl('/media/photo.jpg')).toBe('/media/photo.jpg');
    expect(getPhotoUrl({ url: '/media/url.jpg' })).toBe('/media/url.jpg');
    expect(getPhotoUrl({ original: '/media/original.jpg', thumbnail: '/media/thumb.jpg' })).toBe('/media/original.jpg');
  });

  it('keeps a single profile completion label and prevents manual city edits', () => {
    const profile = source('features/profile/OwnProfileScreen.tsx');
    const editProfile = source('components/EditProfileModal.tsx');
    const settings = source('features/profile/SettingsScreen.tsx');

    expect(profile).toContain('Profilini tamamla');
    expect(profile).not.toContain('Fotoğraflarını tamamla');
    expect(editProfile).not.toContain('placeholder="Şehir"');
    expect(settings).not.toContain('targetCountry');
  });

  it('renders flat flags, Plus/Gold periods, and the revised Boost copy', () => {
    const flag = source('components/ui/CountryFlagBadge.tsx');
    const premium = source('features/premium/PremiumScreen.tsx');
    const boost = source('features/boost/BoostScreen.tsx');

    expect(flag).toContain('rounded-full');
    expect(flag).not.toContain("flag-icons/css/flag-icons.min.css");
    expect(flag).toContain('AVAILABLE_FLAG_CODES');
    expect(flag).toContain('getFlagAssetPath');
    expect(flag).not.toContain('flagcdn.com');
    expect(flag).not.toContain('githubusercontent.com');
    expect(premium).toContain('PUBLIC_PLAN_NAMES');
    expect(premium).not.toContain('VIP');
    expect(PUBLIC_PLAN_NAMES.PLUS).toBe('Ryvo Plus');
    expect(PUBLIC_PLAN_NAMES.GOLD).toBe('Ryvo Gold');
    expect(premium).toContain("id: 'THREE_MONTH'");
    expect(premium).toContain("id: 'SIX_MONTH'");
    expect(premium).toContain('snap-x snap-mandatory');
    expect(premium).toContain("t('missingStorePriceLoading')");
    expect(premium).toContain("t('refreshPricesAction')");
    expect(messages.tr.missingStorePriceLoading).toBe('Mağaza fiyatı yükleniyor.');
    expect(messages.tr.refreshPricesAction).toBe('Fiyatları yenile');
    expect(premium).not.toContain('Rehber fiyat');
    expect(boost).toContain('Profilini Öne Çıkar');
    expect(boost).toContain("Profilini 30 dakika boyunca Keşfet'te daha görünür yap.");
    expect(boost).not.toContain('10 Kat Daha Fazla Görüntülenme');
    expect(boost).toContain('ProfileAvatarFrame');
    expect(boost).toContain('Ryvo Plus ve Gold’u İncele');
    expect(boost).toContain('Ryvo Gold · Ayda 2 Boost');
    expect(boost).toContain('Boost aktif ·');
    expect(premium).toContain('snap-mandatory');
    expect(premium).toContain('data-period={id}');
    expect(premium).toContain('aria-pressed={selected}');
    expect(premium).toContain('-me-4 mt-4');
    expect(premium).not.toContain('pl-4 pr-[15%]');
    expect(premium).not.toMatch(/[₺$]\s*\d/);
  });

  it('keeps partial storefront results and uses private verification media', () => {
    const iap = source('native/iap.ts');
    const verification = source('features/profile/VerificationScreen.tsx');
    const profile = source('features/profile/OwnProfileScreen.tsx');
    const settings = source('features/profile/SettingsScreen.tsx');
    const authStore = source('stores/useAuthStore.ts');

    expect(iap).toContain('Promise.allSettled');
    expect(iap).toContain('subscriptionProductCache');
    expect(iap).not.toContain('setStoreProducts([])');
    expect(verification).toContain("uploadMedia(finalFrame.blob, 'verification')");
    expect(verification).toContain("setSteps([...challenges, 'FINAL'])");
    expect(verification).toContain("setPhase('submitting')");
    expect(verification).toContain('await submitVerification(sessionId, nextFrames)');
    expect(verification).not.toContain('submitVerificationInBackground');
    expect(verification).toContain('data.pending === true');
    expect(verification).toContain('data.verified === true');
    expect(authStore).toContain("verificationState?: 'UNVERIFIED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERIFICATION_REQUIRED'");
    expect(profile).toContain("user?.verificationState === 'PENDING'");
    expect(profile).toContain("? 'İnceleniyor'");
    expect(settings).toContain("verificationComplete || verificationPending ? undefined");
  });
});

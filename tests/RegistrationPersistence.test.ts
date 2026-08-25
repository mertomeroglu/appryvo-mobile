import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '../src/i18n/appLocale';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('registration photo persistence', () => {
  it('counts only server-confirmed registration uploads toward the two-photo gate', () => {
    const wizard = source('src/features/auth/RegistrationWizard.tsx');
    expect(wizard).toContain("photo.uploadStatus === 'uploaded'");
    expect(wizard).toContain('disabled={uploadedPhotoCount < MIN_PHOTOS}');
    expect(wizard).toContain('photoUploadTokens');
    expect(wizard).not.toContain('disabled={photos.length < MIN_PHOTOS}');
  });

  it('uses one reusable bounded local-asset country flag badge without a CDN', () => {
    const badge = source('src/components/ui/CountryFlagBadge.tsx');
    expect(badge).not.toContain("flag-icons/css/flag-icons.min.css");
    expect(badge).toContain('AVAILABLE_FLAG_CODES');
    expect(badge).toContain('getFlagAssetPath');
    expect(badge).toContain('rounded-full');
    expect(badge).not.toContain('flagcdn.com');
    expect(badge).not.toContain('githubusercontent.com');
    expect(badge).not.toMatch(/[🇦-🇿]/u);
  });

  it('separates permission denial from disabled location services and retries on resume', () => {
    const discover = source('src/features/discovery/DiscoverScreen.tsx');
    expect(discover).toContain("'permissionDenied'");
    expect(discover).toContain("'servicesDisabled'");
    expect(discover).toContain("t('discoverOpenLocationSettingsAction')");
    expect(discover).toContain('addStateChangeListener');
    expect(discover).toContain("t('discoverContinueGlobalAction')");
    expect(messages.tr.discoverOpenLocationSettingsAction).toBe('Konum Ayarlarını Aç');
    expect(messages.tr.discoverContinueGlobalAction).toBe('Global Keşfet ile Devam Et');
  });

  it('enforces the 100-210 height domain without printing it below the input', () => {
    const edit = source('src/components/EditProfileModal.tsx');
    expect(edit).toContain('parsedHeight < 100 || parsedHeight > 210');
    expect(edit).not.toContain('min={100}');
    expect(edit).not.toContain('max={210}');
    expect(edit).not.toContain('100-210');
  });
});

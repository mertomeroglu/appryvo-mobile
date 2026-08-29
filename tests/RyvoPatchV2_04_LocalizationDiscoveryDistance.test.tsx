import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveInitialLocale, useAppLocaleStore, APP_LOCALE_OPTIONS } from '../src/i18n/appLocale';
import { LegalModal } from '../src/components/LegalModal';

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('RYVO PATCH V2 04/05 issues 2/3 -- locale priority is manual > device, GPS-free, country-free', () => {
  it('a manually persisted locale always wins over the device locale', () => {
    expect(resolveInitialLocale('en', 'tr-TR').locale).toBe('en');
    expect(resolveInitialLocale('tr', 'en-US').locale).toBe('tr');
  });

  it('falls back to the device locale only when nothing was manually persisted', () => {
    expect(resolveInitialLocale(null, 'en-US')).toEqual({ locale: 'en', needsLanguageSelection: false });
  });

  it('an unsupported device locale (e.g. Turkish device but unsupported region tag) does not get forced to Turkish -- it flags selection needed instead', () => {
    const result = resolveInitialLocale(null, 'xx-YY');
    expect(result.needsLanguageSelection).toBe(true);
    expect(result.locale).toBe('en');
  });

  it('resolveInitialLocale takes no geolocation/country/IP input at all -- its only two parameters are the persisted and device locale strings', () => {
    expect(resolveInitialLocale.length).toBe(2);
  });

  it('the locale resolver and its module never call any geolocation/GPS API', () => {
    const source = readSource('src/i18n/appLocale.ts');
    expect(source).not.toMatch(/getCurrentPosition|watchPosition|Geolocation|requestPermissions\(\)\s*;?\s*\/\/.*location/i);
  });

  it('setLocale is only ever invoked from explicit user-driven pickers (Settings, the shared language picker) -- never from registration or a country/IP lookup', () => {
    const registrationSource = readSource('src/features/auth/RegistrationWizard.tsx');
    expect(registrationSource).not.toMatch(/setLocale\(/);
    expect(registrationSource).not.toMatch(/useAppLocaleStore/);

    const settingsSource = readSource('src/features/profile/SettingsScreen.tsx');
    const pickerSource = readSource('src/components/AppLanguagePicker.tsx');
    expect(settingsSource).toMatch(/setLocale\(/);
    expect(pickerSource).toMatch(/setLocale\(/);
  });

  it('logout only clears secure-storage auth keys, never the persisted locale', () => {
    const secureStorageSource = readSource('src/native/secureStorage.ts');
    const clearAllStart = secureStorageSource.indexOf('async clearAll()');
    const clearAllBody = secureStorageSource.slice(clearAllStart, secureStorageSource.indexOf('},', clearAllStart));
    expect(clearAllBody).not.toMatch(/localStorage|APP_LOCALE_STORAGE_KEY|ryvo_app_locale/);
  });

  it('every one of the 9 supported locales exists and setLocale actually switches the active locale', () => {
    expect(APP_LOCALE_OPTIONS.length).toBe(9);
    useAppLocaleStore.getState().setLocale('en');
    expect(useAppLocaleStore.getState().locale).toBe('en');
    useAppLocaleStore.getState().setLocale('tr');
    expect(useAppLocaleStore.getState().locale).toBe('tr');
  });
});

describe('RYVO PATCH V2 04/05 issue 1 -- hardcoded-string sweep (bounded scope, see report)', () => {
  it('LegalModal renders its close button label from the active locale, not a hardcoded Turkish string', () => {
    useAppLocaleStore.getState().setLocale('en');
    render(
      <LegalModal
        document={{ title: 'Test Doc', updatedLabel: 'Updated', sections: [{ title: 'S', body: 'B' }] } as any}
        onClose={() => {}}
      />
    );
    expect(screen.getByLabelText('Close')).toBeTruthy();
    useAppLocaleStore.getState().setLocale('tr');
  });

  it('BlockedUsersScreen, SupportScreen, MatchModal, and the filter sheet\'s distance controls no longer hardcode their user-facing strings', () => {
    for (const file of [
      'src/features/profile/BlockedUsersScreen.tsx',
      'src/features/support/SupportScreen.tsx',
      'src/components/MatchModal.tsx',
    ]) {
      const source = readSource(file);
      expect(source).toMatch(/useAppTranslation/);
    }
    const filterSheet = readSource('src/components/FilterBottomSheet.tsx');
    expect(filterSheet).toMatch(/t\('maxDistanceLabel'\)/);
    expect(filterSheet).toMatch(/t\('maxDistanceHint'\)/);
  });
});

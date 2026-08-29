import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloatingNavBar } from '../src/components/FloatingNavBar';
import { SplashScreen } from '../src/components/ui/SplashScreen';
import { PASSPORT_LABELS, messages, useAppLocaleStore } from '../src/i18n/appLocale';
import { computeProfileCompletion } from '../src/lib/profileCompletion';
import { useAuthStore } from '../src/stores/useAuthStore';

vi.mock('../src/hooks/useQueries', () => ({
  useLikesUnreadCountQuery: () => ({ data: 0 }),
  useInAppNotificationsQuery: () => ({ data: { unreadCount: 0 } }),
}));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label="current-route">{location.pathname}</output>;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('profile completion behavior', () => {
  it('lists only the individual fields that are actually missing', () => {
    const result = computeProfileCompletion({
      photos: ['/one.jpg', '/two.jpg'],
      bio: 'Hazır',
      interests: [],
      languages: [],
      smokingStatus: 'NEVER',
      drinkingStatus: null,
    });

    expect(result.missing.map((field) => field.key)).toEqual([
      'interests',
      'languages',
      'drinkingStatus',
    ]);
    // CompletionField now carries a translation key (ctaKey) rather than a literal display
    // string -- assert on the key names, and cross-check their `tr` copy matches what used to
    // be hardcoded here.
    expect(result.missing.map((field) => field.ctaKey)).toEqual([
      'completionAddInterestCta',
      'completionAddLanguageCta',
      'completionDrinkingCta',
    ]);
    expect(messages.tr.completionAddInterestCta).toBe('İlgi alanı ekle');
    expect(messages.tr.completionAddLanguageCta).toBe('Dil ekle');
    expect(messages.tr.completionDrinkingCta).toBe('Alkol tercihi');
  });

  it('keeps the completion sheet tappable and deep-links every item to an exact editor anchor', () => {
    const profile = source('src/features/profile/OwnProfileScreen.tsx');
    const editor = source('src/components/EditProfileModal.tsx');
    expect(profile).toContain('setIsCompletionOpen(true)');
    expect(profile).toContain('missingFields.map');
    expect(profile).toContain('openEditModal(field.key)');
    for (const anchor of ['photos', 'bio', 'interests', 'languages', 'smokingStatus', 'drinkingStatus']) {
      expect(editor).toContain(`data-section="${anchor}"`);
    }
    expect(editor).toContain('setUser(optimisticUser)');
  });
});

describe('localized Passport copy', () => {
  it('uses Pasaport in Turkish and a proper localized label in every supported locale', () => {
    expect(PASSPORT_LABELS).toEqual({
      tr: 'Pasaport', en: 'Passport', es: 'Pasaporte', fr: 'Passeport', pt: 'Passaporte',
      ru: 'Паспорт', ar: 'جواز السفر', hi: 'पासपोर्ट', zh: '护照',
    });
    expect(source('src/features/passport/PassportScreen.tsx')).not.toContain('>Passport Modu<');
    expect(source('src/features/profile/OwnProfileScreen.tsx')).not.toContain('label="Passport lokasyonu"');
  });
});

describe('destructive account re-authentication', () => {
  it('sends the password to the server and never compares it in the client', () => {
    const modal = source('src/components/SafetyReportModal.tsx');
    const server = source('../web/server/api/src/user_controller.js');
    expect(modal).toContain("apiClient.delete('/api/account', { password })");
    expect(modal).toContain("t('safetyDeleteAccountConfirmButton')");
    expect(modal).not.toMatch(/password\s*===/);
    expect(server).toContain('await verifyPassword(password, passwordHash)');
    expect(server).toContain('accountDeleteRateLimiter');
    expect(source('src/services/api/apiClient.ts')).toContain("path !== '/api/account'");
  });
});

describe('profile navigation interception regression', () => {
  it('dismisses the bootstrap overlay instead of leaving an invisible tap interceptor', () => {
    vi.useFakeTimers();
    useAuthStore.setState({ sessionChecked: true });
    const onDismiss = vi.fn();
    const { container } = render(<SplashScreen onDismiss={onDismiss} />);
    expect(container.querySelector('.pointer-events-none')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(210));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(container.querySelector('[style*="touch-action"]')).not.toBeInTheDocument();
  });

  it('switches all five bottom destinations for 30 consecutive taps', () => {
    useAppLocaleStore.getState().setLocale('en');
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          {['discover', 'likes', 'map', 'messages', 'profile'].map((path) => (
            <Route key={path} path={`/${path}`} element={<LocationProbe />} />
          ))}
        </Routes>
        <FloatingNavBar />
      </MemoryRouter>
    );

    const destinations = [
      ['Discover', '/discover'],
      ['Likes', '/likes'],
      ['Map', '/map'],
      ['Messages', '/messages'],
      ['Profile', '/profile'],
    ] as const;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      for (const [label, path] of destinations) {
        fireEvent.click(screen.getByRole('link', { name: label }));
        expect(screen.getByLabelText('current-route')).toHaveTextContent(path);
      }
    }
  });

  it('does not route incomplete-photo accounts back to Profile', () => {
    const sessionGate = source('src/app/SessionGate.tsx');
    expect(sessionGate).not.toContain('requiresCompletePhotoProfile');
    expect(sessionGate).not.toContain('user?.photos?.length');
  });
});

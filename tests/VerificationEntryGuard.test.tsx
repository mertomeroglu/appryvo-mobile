import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationScreen } from '../src/features/profile/VerificationScreen';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useAppLocaleStore } from '../src/i18n/appLocale';

// RYVO PATCH V5 01 item 6: a VERIFIED user must never be able to (re-)enter the verification
// flow -- not via the CTA (already guarded at the call site, see MobileFlowFixes.test.ts) and not
// via a direct/stale/back-button navigation to the route itself. A PENDING user must not be able
// to start a second review session the same way. REJECTED/no-status users must still be let in
// (existing retry policy), unchanged by this guard.

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label="current-route">{location.pathname}</output>;
};

function renderVerification(initialPath = '/verification') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route path="/verification" element={<VerificationScreen />} />
        <Route path="/profile" element={<div>Own profile</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('verification entry guard -- VERIFIED/PENDING users cannot (re-)enter the flow', () => {
  beforeEach(() => {
    useAppLocaleStore.getState().setLocale('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('an APPROVED user navigating directly to /verification is redirected to /profile without ever seeing the Start button', async () => {
    useAuthStore.setState({ user: { id: 'u1', verificationState: 'APPROVED' } as any });
    renderVerification();

    await waitFor(() => expect(screen.getByLabelText('current-route')).toHaveTextContent('/profile'));
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('the legacy `verified: true` boolean also blocks entry (back-compat with older profile payloads)', async () => {
    useAuthStore.setState({ user: { id: 'u1', verified: true, verificationState: undefined } as any });
    renderVerification();

    await waitFor(() => expect(screen.getByLabelText('current-route')).toHaveTextContent('/profile'));
  });

  it('a PENDING user navigating directly to /verification is redirected to /profile, never able to start a second session', async () => {
    useAuthStore.setState({ user: { id: 'u1', verificationState: 'PENDING' } as any });
    renderVerification();

    await waitFor(() => expect(screen.getByLabelText('current-route')).toHaveTextContent('/profile'));
  });

  it('a REJECTED user is NOT blocked -- the existing retry policy is untouched', async () => {
    useAuthStore.setState({ user: { id: 'u1', verificationState: 'REJECTED' } as any });
    renderVerification();

    await screen.findByRole('button', { name: 'Start' });
    expect(screen.getByLabelText('current-route')).toHaveTextContent('/verification');
  });

  it('a never-verified (no status) user is NOT blocked and can start the flow normally', async () => {
    useAuthStore.setState({ user: { id: 'u1', verificationState: undefined, verified: undefined } as any });
    renderVerification();

    await screen.findByRole('button', { name: 'Start' });
    expect(screen.getByLabelText('current-route')).toHaveTextContent('/verification');
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionGate } from '../src/app/SessionGate';
import { AuthScreen } from '../src/features/auth/AuthScreen';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useAppLocaleStore } from '../src/i18n/appLocale';

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label="current-route">{location.pathname}</output>;
};

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route element={<SessionGate />}>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/discover/:userId" element={<div>Paylaşılan profil</div>} />
          <Route path="/map" element={<div>Dünya</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

async function loginFromWelcomeScreen() {
  const loginEntryButton = await screen.findByRole('button', { name: 'Giriş Yap' });
  fireEvent.click(loginEntryButton);
  const identifier = await screen.findByRole('textbox', { name: '' });
  const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
  fireEvent.change(identifier, { target: { value: 'mert@example.com' } });
  fireEvent.change(password, { target: { value: 'secret123' } });
  fireEvent.submit(password.closest('form')!);
}

describe('RYVO PATCH 05 issue 8 -- shared-profile deep link survives the login/register detour', () => {
  beforeEach(() => {
    useAppLocaleStore.getState().setLocale('tr');
    useAuthStore.setState({ isLoading: false, user: null, isAuthenticated: false, sessionChecked: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('an unauthenticated tap on a shared profile link is redirected to /auth carrying the original destination', async () => {
    renderApp('/discover/abc-123-uuid');

    // SessionGate must bounce to /auth (no session yet) rather than silently rendering the
    // protected route or dropping the intended destination.
    await screen.findByRole('button', { name: 'Giriş Yap' });
    expect(screen.getByLabelText('current-route')).toHaveTextContent('/auth');
  });

  it('logging in from that redirect resumes the originally-shared profile, not the default /map', async () => {
    const login = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({ isAuthenticated: true, user: { id: 'me' } as any });
    });
    useAuthStore.setState({ login });

    renderApp('/discover/abc-123-uuid');
    await loginFromWelcomeScreen();

    await waitFor(() => expect(login).toHaveBeenCalled());
    // Must land back on the shared profile the deep link actually pointed at, not /discover.
    await screen.findByText('Paylaşılan profil');
    expect(screen.getByLabelText('current-route')).toHaveTextContent('/discover/abc-123-uuid');
  });

  it('a plain (no deep link) app open lands on the default /map (World/Social Discovery) route after login', async () => {
    const login = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({ isAuthenticated: true, user: { id: 'me' } as any });
    });
    useAuthStore.setState({ login });

    // Go straight to /auth as a fresh, un-redirected visit (no `state.from` at all) to isolate
    // the fallback behavior from the redirect-carries-state behavior tested above.
    renderApp('/auth');
    await loginFromWelcomeScreen();

    await waitFor(() => expect(login).toHaveBeenCalled());
    await screen.findByText('Dünya');
    expect(screen.getByLabelText('current-route')).toHaveTextContent('/map');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLanguagePicker } from '../src/components/AppLanguagePicker';
import {
  APP_LOCALE_STORAGE_KEY,
  APP_LOCALE_OPTIONS,
  useAppLocaleStore,
} from '../src/i18n/appLocale';
import { apiClient } from '../src/services/api/apiClient';
import { useAuthStore } from '../src/stores/useAuthStore';

describe('AppLanguagePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppLocaleStore.setState({ locale: 'en', needsLanguageSelection: false });
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.restoreAllMocks();
  });

  // RYVO PATCH V3: root cause of "recipient stays on Turkish push notifications despite
  // selecting English" was that switching app language only ever persisted to localStorage --
  // users.language_code (what the backend renders notifications in) never learned about it.
  // RYVO PATCH V4 03: the sync now lives inside useAppLocaleStore.setLocale() itself (dynamic
  // imports, to avoid a circular import with apiClient.ts/authService.ts, both of which already
  // import this module) rather than being duplicated in this component -- the actual apiClient.put
  // call now happens a few promise ticks after setLocale() returns, hence the waitFor below.
  it('syncs the chosen locale to the backend (users.language_code) when the user is logged in', async () => {
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'success' });
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'u1', email: 'a@b.com', name: 'A' } as any,
    });

    render(<AppLanguagePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose app language' }));
    fireEvent.click(screen.getByRole('option', { name: /Français/ }));

    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('/api/profile', { targetLang: 'fr' }));
  });

  it('never calls the backend for a pre-auth (logged-out) language selection', async () => {
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'success' });
    useAuthStore.setState({ isAuthenticated: false, user: null });

    render(<AppLanguagePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose app language' }));
    fireEvent.click(screen.getByRole('option', { name: /Français/ }));

    expect(useAppLocaleStore.getState().locale).toBe('fr');
    // Give the dynamic-import chain a chance to run before asserting the negative, otherwise
    // this would trivially pass even if the isAuthenticated gate were broken.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('opens from the auth trigger and applies a language immediately', () => {
    render(<AppLanguagePicker />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose app language' }));
    fireEvent.click(screen.getByRole('option', { name: /Français/ }));

    expect(useAppLocaleStore.getState().locale).toBe('fr');
    expect(localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('shows the required picker globally for an unsupported device language', () => {
    useAppLocaleStore.setState({ locale: 'en', needsLanguageSelection: true });
    render(<AppLanguagePicker showTrigger={false} />);

    expect(screen.getByText(/device language is not supported/i)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(APP_LOCALE_OPTIONS.length);

    fireEvent.click(screen.getByRole('option', { name: /Türkçe/ }));
    expect(useAppLocaleStore.getState().needsLanguageSelection).toBe(false);
  });

  it('keeps Arabic document direction isolated from country or location signals', () => {
    render(<AppLanguagePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose app language' }));
    fireEvent.click(screen.getByRole('option', { name: /العربية/ }));

    expect(document.documentElement.dir).toBe('rtl');
  });
});

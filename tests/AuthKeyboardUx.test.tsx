import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from '../src/features/auth/AuthScreen';
import { RegistrationWizard } from '../src/features/auth/RegistrationWizard';
import { apiClient } from '../src/services/api/apiClient';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useAppLocaleStore } from '../src/i18n/appLocale';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('auth keyboard form UX', () => {
  beforeEach(() => {
    useAppLocaleStore.getState().setLocale('tr');
    useAuthStore.setState({ isLoading: false, user: null, isAuthenticated: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves login focus to password and submits the native form path', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login });

    render(
      <MemoryRouter>
        <AuthScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    const identifier = await screen.findByRole('textbox', { name: '' });
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    expect(password).not.toBeNull();

    fireEvent.change(identifier, { target: { value: 'mert@example.com' } });
    fireEvent.keyDown(identifier, { key: 'Enter', code: 'Enter' });
    expect(password).toHaveFocus();

    fireEvent.change(password!, { target: { value: 'secret123' } });
    fireEvent.submit(password!.closest('form')!);

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ identifier: 'mert@example.com', password: 'secret123' });
    });
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('enterkeyhint', 'done');
  });

  it('supports keyboard-only basic registration and available-username progression', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/username/check')) {
        return { data: { valid: true, available: true } };
      }
      if (path.includes('/email/check')) {
        return { data: { valid: true, available: true } };
      }
      return { data: {} };
    });

    render(
      <RegistrationWizard onExit={vi.fn()} onComplete={vi.fn()} />,
    );

    const name = screen.getByPlaceholderText('İsmin');
    const email = screen.getByPlaceholderText('E-posta Adresi');
    const password = screen.getByPlaceholderText('Şifre');

    fireEvent.keyDown(name, { key: 'Enter', code: 'Enter' });
    expect(email).toHaveFocus();
    fireEvent.keyDown(email, { key: 'Enter', code: 'Enter' });
    expect(password).toHaveFocus();

    fireEvent.change(name, { target: { value: 'Mert' } });
    fireEvent.change(email, { target: { value: 'mert@example.com' } });
    fireEvent.change(password, { target: { value: 'secret123' } });

    // The email step's own debounced GET /api/auth/email/check must resolve (confirming
    // availability) before Continue is enabled -- this is the earlier-than-final-submit
    // duplicate check itself, so the test has to wait on it like a real user would.
    const continueButton = screen.getByRole('button', { name: 'Devam Et' });
    await waitFor(() => expect(continueButton).not.toBeDisabled(), { timeout: 2000 });
    fireEvent.submit(password.closest('form')!);

    const username = await screen.findByPlaceholderText('Kullanıcı Adı');
    fireEvent.change(username, { target: { value: 'mert_ryvo' } });
    await screen.findByText('Kullanılabilir', {}, { timeout: 2000 });
    fireEvent.submit(username.closest('form')!);

    expect(await screen.findByText('Doğum Tarihin')).toBeInTheDocument();
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(username).toHaveAttribute('enterkeyhint', 'next');
  });

  it('keeps native resize, visual viewport, and inner auth scrolling contracts', () => {
    const manifest = source('android/app/src/main/AndroidManifest.xml');
    const capacitor = source('capacitor.config.ts');
    const globals = source('src/styles/globals.css');
    const viewportHook = source('src/hooks/useKeyboardViewport.ts');
    const registration = source('src/features/auth/RegistrationWizard.tsx');

    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(capacitor).toContain("resize: 'native'");
    expect(globals).toContain('height: var(--app-viewport-height, 100dvh)');
    expect(globals).toContain('.auth-keyboard-scroll');
    expect(globals).toContain('overflow-y: auto');
    expect(viewportHook).toContain('window.visualViewport');
    expect(viewportHook).toContain("document.addEventListener('focusin'");
    expect(registration).toContain("const canSubmitUsername = username.length >= 5 && usernameStatus === 'available';");
  });
});

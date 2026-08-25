import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppLanguagePicker } from '../src/components/AppLanguagePicker';
import {
  APP_LOCALE_STORAGE_KEY,
  APP_LOCALE_OPTIONS,
  useAppLocaleStore,
} from '../src/i18n/appLocale';

describe('AppLanguagePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppLocaleStore.setState({ locale: 'en', needsLanguageSelection: false });
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

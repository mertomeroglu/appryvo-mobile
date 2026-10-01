import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyntheticContentBadge } from '../src/components/SyntheticContentBadge';
import { useAppLocaleStore } from '../src/i18n/appLocale';

describe('transparent synthetic-content labels', () => {
  beforeEach(() => useAppLocaleStore.getState().setLocale('en'));

  it('renders an explicit demo profile marker', () => {
    render(<SyntheticContentBadge />);
    expect(screen.getByText('Demo Account')).toBeTruthy();
  });

  it('renders an explicit demo conversation marker', () => {
    render(<SyntheticContentBadge kind="conversation" />);
    expect(screen.getByText('Demo conversation')).toBeTruthy();
  });

  it('renders the system-owned marker independently of face verification', () => {
    render(<SyntheticContentBadge kind="official" />);
    expect(screen.getByText('Ryvo Official')).toBeTruthy();
  });
});

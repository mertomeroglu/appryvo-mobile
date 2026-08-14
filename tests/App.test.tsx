import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthShell, DiscoverShell } from '../src/routes/shells';

describe('App Shell Components', () => {
  it('renders Auth Shell correctly', () => {
    render(<AuthShell />);
    expect(screen.getByText('Auth Shell')).toBeInTheDocument();
  });

  it('renders Discover Shell correctly', () => {
    render(<DiscoverShell />);
    expect(screen.getByText('Discover Shell')).toBeInTheDocument();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAppLocaleStore, useAppTranslation } from '../src/i18n/appLocale';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('iOS runaway geolocation / render loop fix', () => {
  it('keeps useAppTranslation().t referentially stable across re-renders for the same locale', () => {
    useAppLocaleStore.getState().setLocale('tr');
    const { result, rerender } = renderHook(() => useAppTranslation());
    const first = result.current;

    rerender();
    rerender();

    expect(result.current.t).toBe(first.t);
    expect(result.current).toBe(first);
  });

  it('only produces a new t when the locale actually changes', () => {
    useAppLocaleStore.getState().setLocale('tr');
    const { result } = renderHook(() => useAppTranslation());
    const trT = result.current.t;

    act(() => useAppLocaleStore.getState().setLocale('en'));
    expect(result.current.t).not.toBe(trT);

    act(() => useAppLocaleStore.getState().setLocale('tr'));
  });

  it('does not re-run a mount-only effect when a component consuming t re-renders (root cause reproduction)', () => {
    // Reproduces the exact shape that caused the production loop: a useCallback that closes
    // over `t`, wired into a "run once" useEffect. Before the fix, useAppTranslation() returned
    // a brand-new `t` every render, so `resolveDiscoverLocation` (and anything depending on it)
    // was recreated on every render -- and since resolving location itself triggers state
    // updates/re-renders, a `useEffect(..., [resolveDiscoverLocation])` fired forever.
    let effectRuns = 0;
    let lastSeenT: ((key: 'appTitle') => string) | null = null;

    const Probe: React.FC<{ renderTick: number }> = ({ renderTick }) => {
      const { t } = useAppTranslation();
      lastSeenT = t;
      const resolve = React.useCallback(() => {
        void renderTick;
        void t;
      }, [renderTick, t]);

      React.useEffect(() => {
        effectRuns += 1;
        void resolve();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return null;
    };

    const { rerender } = render(<Probe renderTick={0} />);
    const tAfterFirstRender = lastSeenT;
    rerender(<Probe renderTick={1} />);
    rerender(<Probe renderTick={2} />);

    expect(effectRuns).toBe(1);
    expect(lastSeenT).toBe(tAfterFirstRender);
  });

  it('never auto-requests location on Map screen mount -- check-in stays a single explicit action', () => {
    const map = source('features/map/SocialMapScreen.tsx');

    // acquireLocalLocation must only be invoked from explicit user actions (check-in, recenter,
    // retry pills), never from a mount effect.
    const mountEffectMatches = [...map.matchAll(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g)];
    for (const match of mountEffectMatches) {
      expect(match[0]).not.toContain('acquireLocalLocation');
      expect(match[0]).not.toContain('checkInToMap');
    }

    // The people map (and its "show me on the map" check-in/hide toggle) is gone: rooms only.
    expect(map).not.toContain('checkInToMap');
    expect(map).not.toContain('hideFromMap');
  });

});

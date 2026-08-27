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

  it('registers the App lifecycle listener exactly once and never resolves location on mount', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    // The location-gate callback still legitimately depends on t/refetch (it calls t() and
    // refetch() internally), so it is still recreated when either changes -- but the effect that
    // used to depend directly on it no longer does; it registers once and reads the latest
    // implementation through a ref instead.
    expect(screen).toContain('const resolveDiscoverLocationRef = useRef(resolveDiscoverLocation);');
    expect(screen).toContain('resolveDiscoverLocationRef.current = resolveDiscoverLocation;');

    // No effect may call resolveDiscoverLocation unconditionally on mount -- Discover must never
    // touch Geolocation just because it rendered.
    expect(screen).not.toContain('void resolveDiscoverLocationRef.current(false);');
    expect(screen).not.toMatch(/useEffect\(\(\) => \{\s*void resolveDiscoverLocation/);

    const listenerEffectStart = screen.indexOf('nativeApp.addStateChangeListener');
    expect(listenerEffectStart).toBeGreaterThan(-1);
    const listenerEffectSlice = screen.slice(listenerEffectStart, listenerEffectStart + 900);
    // Resuming must only retry location when a pending explicit "sent to Settings" flag is set,
    // and that flag must be consumed (cleared) as part of the same check.
    expect(listenerEffectSlice).toContain('state.isActive && retryLocationOnResumeRef.current');
    expect(listenerEffectSlice).toContain('retryLocationOnResumeRef.current = false;');
    expect(listenerEffectSlice).toContain('resolveDiscoverLocationRef.current(false, true, false)');
    expect(listenerEffectSlice).toContain('}, []);');
    // The App listener's own effect must not re-subscribe every time resolveDiscoverLocation is
    // recreated (e.g. on every t/refetch change).
    expect(listenerEffectSlice).not.toContain('[resolveDiscoverLocation]');
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

    expect(map).toContain('const checkInToMap = useCallback(async () => {');
    expect(map).toContain('const hideFromMap = useCallback(() => {');
    // Hiding never re-requests GPS.
    const hideStart = map.indexOf('const hideFromMap = useCallback(() => {');
    const hideBody = map.slice(hideStart, map.indexOf('}, [updateProfileMutation]);', hideStart));
    expect(hideBody).not.toContain('acquireLocalLocation');
    expect(hideBody).not.toContain('getCurrentPosition');
  });

  it('falls back to initials instead of a broken image when a map marker photo fails to decode (e.g. malformed WEBP)', () => {
    const map = source('features/map/SocialMapScreen.tsx');

    expect(map).toContain("onerror=\"this.style.display='none'\"");
    // Both the avatar marker and the cluster face images must render an initials layer
    // underneath so a failed decode reveals a fallback instead of a broken-image glyph, and the
    // onerror handler only ever hides the element once (no retry loop).
    const avatarIconStart = map.indexOf('export function avatarMarkerIcon');
    const avatarIconBody = map.slice(avatarIconStart, map.indexOf('export function buildSocialClusterHtml'));
    expect(avatarIconBody).toContain('initialsTag');
    expect((avatarIconBody.match(/onerror=/g) || []).length).toBeGreaterThanOrEqual(1);

    const clusterStart = map.indexOf('export function buildSocialClusterHtml');
    const clusterBody = map.slice(clusterStart, map.indexOf('function socialClusterIcon'));
    expect(clusterBody).toContain('initialsTag');
    expect(clusterBody).toContain("onerror=\"this.style.display='none'\"");
  });
});

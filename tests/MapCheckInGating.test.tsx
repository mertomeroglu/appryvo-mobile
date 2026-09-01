import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- MapLibre stub --------------------------------------------------------------------------
// SocialMapScreen drives a real MapLibre GL JS map instance, which needs a WebGL context and a
// Worker -- neither exists in jsdom. None of that matters for a check-in/hide call-count test,
// so this stub gives back stable, chainable fakes for every maplibregl.* entry point the
// component calls, instead of rendering a real map.
function makeMarkerStub() {
  const marker: any = {
    remove: vi.fn(),
    getElement: vi.fn(() => document.createElement('div')),
  };
  marker.setLngLat = vi.fn(() => marker);
  marker.addTo = vi.fn(() => marker);
  return marker;
}

vi.mock('maplibre-gl', () => {
  const mapStub: any = {
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'load') cb();
    }),
    remove: vi.fn(),
    addControl: vi.fn(),
    getBounds: vi.fn(() => ({ getNorth: () => 41.1, getSouth: () => 40.9, getEast: () => 29.1, getWest: () => 28.9 })),
    getZoom: vi.fn(() => 13),
    resize: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    setStyle: vi.fn(),
  };
  return {
    Map: vi.fn(() => mapStub),
    Marker: vi.fn(() => makeMarkerStub()),
    AttributionControl: vi.fn(() => ({})),
    setWorkerUrl: vi.fn(),
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('supercluster', () => ({
  default: vi.fn(() => ({
    load: vi.fn(),
    getClusters: vi.fn(() => []),
    getLeaves: vi.fn(() => []),
    getClusterExpansionZoom: vi.fn(() => 10),
  })),
}));
vi.mock('../src/features/map/ryvoMapConfig', () => ({
  OPENMAPTILES_TILEJSON_URL: 'https://tiles.test.invalid/data/v3.json',
  OPENMAPTILES_SPRITE_URL: undefined,
  OPENMAPTILES_GLYPHS_URL: undefined,
  isRyvoMapConfigured: () => true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

const getCurrentPositionMock = vi.fn(async () => ({ timestamp: Date.now(), coords: { latitude: 41.0, longitude: 29.0, accuracy: 8 } }));
vi.mock('../src/native/location', () => ({
  nativeLocation: {
    getCurrentPosition: (...args: unknown[]) => getCurrentPositionMock(...args),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
}));

vi.mock('../src/native/haptics', () => ({
  nativeHaptics: { impact: vi.fn(), notification: vi.fn(), selection: vi.fn() },
}));

const apiPostMock = vi.fn(async () => ({ status: 'success' }));
vi.mock('../src/services/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: [] })),
    post: (...args: unknown[]) => apiPostMock(...args),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Stable references throughout -- see PrivacyLocationGating.test.tsx for why a fresh object
// literal per mock call would itself create a render loop via useEffect dependency churn.
const mapUsersData: unknown[] = [];
const framesData = { frames: [] as unknown[] };
const meData = { mapVisible: false };
const updateProfileMutateMock = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});

vi.mock('../src/hooks/useQueries', () => ({
  useDiscoveryMapQuery: () => ({ data: mapUsersData, isFetching: false }),
  useDiscoveryUserQuery: () => ({ data: undefined, isFetching: false }),
  useFramesQuery: () => ({ data: framesData }),
  useMeQuery: () => ({ data: meData }),
  useLikeMutation: () => ({ mutateAsync: vi.fn() }),
  usePassMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateProfileMutation: () => ({ mutate: updateProfileMutateMock, mutateAsync: vi.fn(), isPending: false }),
}));

import { SocialMapScreen } from '../src/features/map/SocialMapScreen';

function renderMap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SocialMapScreen />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Ryvo privacy requirement: map visibility is manual check-in only', () => {
  beforeEach(() => {
    getCurrentPositionMock.mockClear();
    apiPostMock.mockClear();
    updateProfileMutateMock.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => setTimeout(() => cb(0), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    // SocialMapScreen resolves its own TileJSON via fetch() (see its map-init effect) and watches
    // its container with a ResizeObserver -- jsdom has neither by default; stubbed here so this
    // test never makes a real network call and never throws on a missing browser API.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ tiles: ['https://tiles.test.invalid/{z}/{x}/{y}.pbf'] }),
    } as Response)));
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never requests GPS just from mounting the map screen', async () => {
    renderMap();
    await screen.findByRole('button', { name: 'Show Up' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('tapping "Görün" performs exactly one location operation and publishes visibility once', async () => {
    renderMap();
    const checkInButton = await screen.findByRole('button', { name: 'Show Up' });

    fireEvent.click(checkInButton);

    await waitFor(() => expect(getCurrentPositionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/user/location',
      expect.objectContaining({ mapVisible: true })
    );

    // Visibility flips to "checked in" -- no further GPS access happens on its own afterwards.
    await screen.findByRole('button', { name: /You're visible on the map/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
  });

  it('hiding from the map never re-requests GPS', async () => {
    renderMap();
    const checkInButton = await screen.findByRole('button', { name: 'Show Up' });
    fireEvent.click(checkInButton);
    await waitFor(() => expect(getCurrentPositionMock).toHaveBeenCalledTimes(1));

    const hideButton = await screen.findByRole('button', { name: /You're visible on the map/ });
    getCurrentPositionMock.mockClear();
    fireEvent.click(hideButton);

    await waitFor(() => expect(updateProfileMutateMock).toHaveBeenCalledTimes(1));
    expect(updateProfileMutateMock).toHaveBeenCalledWith(
      { mapVisible: false },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(getCurrentPositionMock).not.toHaveBeenCalled();

    await screen.findByRole('button', { name: 'Show Up' });
  });

  it('RYVO PATCH 05 issue 2 -- other viewers\' map queries poll instead of going stale indefinitely after someone hides', () => {
    // POST /api/user/location (location_controller.js) flips users.map_visible/
    // user_locations.map_visible synchronously, so GET /api/discovery/map already excludes a
    // hidden user on its very next call -- the gap was purely client-side: the app's QueryClient
    // disables refetchOnWindowFocus globally (main.tsx), and useDiscoveryMapQuery had no
    // refetchInterval either, so another viewer's already-fetched marker list had NO trigger to
    // ever refresh unless they physically panned/zoomed the map (which changes the bbox query
    // key). A stationary viewer would keep seeing a since-hidden user indefinitely, not just
    // briefly. A bounded polling interval closes that into a fixed, short exposure window.
    const source = readFileSync(resolve(process.cwd(), 'src/hooks/useQueries.ts'), 'utf8');
    const fnStart = source.indexOf('export function useDiscoveryMapQuery(');
    const fnBody = source.slice(fnStart, source.indexOf('export function', fnStart + 1));
    expect(fnBody).toMatch(/refetchInterval:\s*15\s*\*\s*1000/);
    expect(fnBody).toMatch(/staleTime:\s*15\s*\*\s*1000/);
  });
});

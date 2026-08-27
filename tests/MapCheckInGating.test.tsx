import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Leaflet stub -------------------------------------------------------------------------
// SocialMapScreen drives a real Leaflet map instance; none of that matters for a check-in/hide
// call-count test, and rendering real Leaflet against jsdom is unnecessary risk. This stub gives
// back stable, chainable fakes for every L.* entry point the component calls.
function makeLayerStub() {
  const layer: any = {
    on: vi.fn(),
    off: vi.fn(),
    addLayer: vi.fn(),
    clearLayers: vi.fn(),
    setLatLng: vi.fn(),
    setIcon: vi.fn(),
    removeLayer: vi.fn(),
    bringToBack: vi.fn(),
    remove: vi.fn(),
    getAllChildMarkers: vi.fn(() => []),
    getChildCount: vi.fn(() => 0),
  };
  layer.addTo = vi.fn(() => layer);
  return layer;
}

vi.mock('leaflet', () => {
  const mapStub: any = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    getBounds: vi.fn(() => ({ getNorth: () => 41.1, getSouth: () => 40.9, getEast: () => 29.1, getWest: () => 28.9 })),
    getZoom: vi.fn(() => 13),
    getMaxZoom: vi.fn(() => 19),
    invalidateSize: vi.fn(),
    flyTo: vi.fn(),
  };
  return {
    map: vi.fn(() => mapStub),
    markerClusterGroup: vi.fn(() => makeLayerStub()),
    marker: vi.fn(() => makeLayerStub()),
    divIcon: vi.fn(() => ({})),
    tileLayer: vi.fn(() => makeLayerStub()),
  };
});
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

const getCurrentPositionMock = vi.fn(async () => ({ coords: { latitude: 41.0, longitude: 29.0, accuracy: 8 } }));
vi.mock('../src/native/location', () => ({
  nativeLocation: {
    getCurrentPosition: (...args: unknown[]) => getCurrentPositionMock(...args),
    watchPosition: vi.fn(),
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never requests GPS just from mounting the map screen', async () => {
    renderMap();
    await screen.findByRole('button', { name: 'Görün' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('tapping "Görün" performs exactly one location operation and publishes visibility once', async () => {
    renderMap();
    const checkInButton = await screen.findByRole('button', { name: 'Görün' });

    fireEvent.click(checkInButton);

    await waitFor(() => expect(getCurrentPositionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/user/location',
      expect.objectContaining({ mapVisible: true })
    );

    // Visibility flips to "checked in" -- no further GPS access happens on its own afterwards.
    await screen.findByRole('button', { name: /Haritada görünüyorsun/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
  });

  it('hiding from the map never re-requests GPS', async () => {
    renderMap();
    const checkInButton = await screen.findByRole('button', { name: 'Görün' });
    fireEvent.click(checkInButton);
    await waitFor(() => expect(getCurrentPositionMock).toHaveBeenCalledTimes(1));

    const hideButton = await screen.findByRole('button', { name: /Haritada görünüyorsun/ });
    getCurrentPositionMock.mockClear();
    fireEvent.click(hideButton);

    await waitFor(() => expect(updateProfileMutateMock).toHaveBeenCalledTimes(1));
    expect(updateProfileMutateMock).toHaveBeenCalledWith(
      { mapVisible: false },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(getCurrentPositionMock).not.toHaveBeenCalled();

    await screen.findByRole('button', { name: 'Görün' });
  });
});

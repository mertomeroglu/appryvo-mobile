import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Native/plugin mocks -----------------------------------------------------------------
// DiscoverScreen imports Geolocation/Capacitor directly (for its own permission gating), so
// those are mocked here rather than through the ../../native wrappers, to observe exactly the
// same calls the iOS runtime log flagged (Geolocation.checkPermissions / getCurrentPosition).

const checkPermissionsMock = vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' }));
const requestPermissionsMock = vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' }));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: (...args: unknown[]) => checkPermissionsMock(...args),
    requestPermissions: (...args: unknown[]) => requestPermissionsMock(...args),
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
  },
}));

let capturedStateListener: ((state: { isActive: boolean }) => void) | null = null;
const addStateChangeListenerMock = vi.fn(async (listener: (state: { isActive: boolean }) => void) => {
  capturedStateListener = listener;
  return { remove: vi.fn() };
});
vi.mock('../src/native/app', () => ({
  nativeApp: {
    addStateChangeListener: (listener: (state: { isActive: boolean }) => void) => addStateChangeListenerMock(listener),
    addBackButtonListener: vi.fn(async () => ({ remove: vi.fn() })),
    getAppInfo: vi.fn(async () => ({ name: 'Ryvo', id: 'com.appryvo.ryvo', build: '1', version: '1.0.0' })),
    exitApp: vi.fn(),
  },
}));

const getCurrentPositionMock = vi.fn(async () => ({ coords: { latitude: 41, longitude: 29, accuracy: 10 } }));
vi.mock('../src/native/location', () => ({
  nativeLocation: {
    getCurrentPosition: (...args: unknown[]) => getCurrentPositionMock(...args),
    watchPosition: vi.fn(),
  },
}));

vi.mock('../src/native/nativeSettings', () => ({
  nativeAppSettings: {
    open: vi.fn(async () => {}),
    openLocationServices: vi.fn(async () => {}),
  },
}));

vi.mock('../src/native/network', () => ({
  nativeNetwork: {
    getStatus: vi.fn(async () => ({ connected: false })),
    addStatusListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock('../src/native/haptics', () => ({
  nativeHaptics: { impact: vi.fn(), notification: vi.fn(), selection: vi.fn() },
}));

const apiPostMock = vi.fn(async () => ({ status: 'success' }));
vi.mock('../src/services/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: {} })),
    post: (...args: unknown[]) => apiPostMock(...args),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// A single shared, stable `data` reference -- real react-query only hands out a new `data`
// object when the query actually refetches with different results. A mock that returns a fresh
// object literal every call breaks that invariant: DiscoverScreen's
// `useEffect(() => { ... }, [feedPage])` would then see a "changed" dependency on every render,
// call setDeck with a new (if logically identical) array, re-render, and loop forever -- which is
// exactly the bug class this whole fix is about, just self-inflicted by the test double instead
// of the app.
const feedPageData = { profiles: [] as unknown[], paging: { limit: 20, hasMore: false, nextCursor: null } };
const discoveryFeedQueryMock = vi.fn(() => ({
  data: feedPageData,
  error: null,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
// Discovery now runs through the question-based V2 feed; the location contracts below are
// unchanged by that swap, so the same stable-reference double just moves to the new hook.
vi.mock('../src/hooks/useQuestionQueries', () => ({
  useDiscoveryV2FeedQuery: (...args: unknown[]) => discoveryFeedQueryMock(...args),
  useDiscoveryPassMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQuestionStatusQuery: () => ({ data: undefined }),
  useQuestionInboxQuery: () => ({ data: undefined, refetch: vi.fn() }),
  useOwnProfileQuestionsQuery: () => ({ data: undefined }),
  useQuestionPresetsQuery: () => ({ data: undefined }),
  useStartQuestionAttemptMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAnswerQuestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInteractionActionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQuestionSuperlikeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetDiscoveryPassesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateProfileQuestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProfileQuestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProfileQuestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderProfileQuestionsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../src/hooks/useQueries', () => ({
  useEntitlementsQuery: () => ({ data: undefined }),
  useInAppNotificationsQuery: () => ({ data: undefined }),
  useLikeMutation: () => ({ mutateAsync: vi.fn() }),
  usePassMutation: () => ({ mutateAsync: vi.fn() }),
  useMeQuery: () => ({ data: undefined }),
  useUpdateProfileMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useInitRewardSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useVerifyRewardSessionMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { DiscoverScreen } from '../src/features/discovery/DiscoverScreen';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useAppLocaleStore } from '../src/i18n/appLocale';

function renderDiscover() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DiscoverScreen />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Ryvo privacy requirement: Discover never touches GPS on its own', () => {
  beforeEach(() => {
    localStorage.clear();
    checkPermissionsMock.mockClear();
    requestPermissionsMock.mockClear();
    getCurrentPositionMock.mockClear();
    apiPostMock.mockClear();
    addStateChangeListenerMock.mockClear();
    discoveryFeedQueryMock.mockClear();
    capturedStateListener = null;
    useAuthStore.setState({ user: { id: 'viewer-1' } as any, isAuthenticated: true, isLoading: false });
    useAppLocaleStore.getState().setLocale('tr');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fresh launch: mounting Discover makes zero Geolocation calls', async () => {
    renderDiscover();
    await waitFor(() => expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1));
    await flush();

    expect(checkPermissionsMock).not.toHaveBeenCalled();
    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    // The deck still renders (global discovery) -- the feed query ran despite no location.
    expect(discoveryFeedQueryMock).toHaveBeenCalled();
  });

  it('does not enter a render loop on mount (bounded render count, not hundreds)', async () => {
    renderDiscover();
    await waitFor(() => expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // The original bug re-rendered (and re-hit Geolocation/App listener/SecureStorage) roughly
    // every 90-100ms without bound. A handful of settle renders is normal; hundreds is the bug.
    expect(discoveryFeedQueryMock.mock.calls.length).toBeLessThan(6);
    expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('stays at a single listener registration and zero location calls even when locale changes mid-session (root cause regression)', async () => {
    renderDiscover();
    await waitFor(() => expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1));
    await flush();

    act(() => {
      useAppLocaleStore.getState().setLocale('en');
    });
    await flush();
    act(() => {
      useAppLocaleStore.getState().setLocale('tr');
    });
    await flush();

    // Before the fix, useAppTranslation() handed out a new `t` on every render, which
    // recreated resolveDiscoverLocation and re-fired effects that depended on it directly.
    expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1);
    expect(checkPermissionsMock).not.toHaveBeenCalled();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
  });

  it('ordinary app resume (no pending settings-return retry) makes zero Geolocation calls', async () => {
    renderDiscover();
    await waitFor(() => expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1));
    expect(capturedStateListener).toBeTypeOf('function');

    act(() => {
      capturedStateListener?.({ isActive: true });
    });
    await flush();

    expect(checkPermissionsMock).not.toHaveBeenCalled();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    // The resume handler must not itself cause a re-subscription.
    expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('a resume that IS a pending settings-return retry checks permissions exactly once, then clears the flag', async () => {
    renderDiscover();
    await waitFor(() => expect(addStateChangeListenerMock).toHaveBeenCalledTimes(1));

    // Reach the "permission denied -> open settings" pill/modal via the same explicit taps a
    // real user takes: open the collapsed pill, then request location so the gate can reach a
    // deniable state deterministically.
    checkPermissionsMock.mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'prompt' });
    requestPermissionsMock.mockResolvedValueOnce({ location: 'denied', coarseLocation: 'denied' });
    const pill = await screen.findByRole('button', { name: /konum izni ver/i });
    fireEvent.click(pill);

    const grantButton = await screen.findByRole('button', { name: 'Konum İzni Ver' });
    fireEvent.click(grantButton);
    await waitFor(() => expect(requestPermissionsMock).toHaveBeenCalledTimes(1));

    const settingsButton = await screen.findByRole('button', { name: 'Uygulama Ayarlarını Aç' });
    checkPermissionsMock.mockClear();
    fireEvent.click(settingsButton);
    await flush();

    // Now simulate the OS bringing the app back to the foreground after the Settings visit.
    act(() => {
      capturedStateListener?.({ isActive: true });
    });
    await waitFor(() => expect(checkPermissionsMock).toHaveBeenCalledTimes(1));

    // A second, unrelated resume must NOT check again -- the retry flag was consumed.
    checkPermissionsMock.mockClear();
    act(() => {
      capturedStateListener?.({ isActive: true });
    });
    await flush();
    expect(checkPermissionsMock).not.toHaveBeenCalled();
  });
});

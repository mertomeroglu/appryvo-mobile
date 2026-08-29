import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/hooks/useQueries', () => ({
  QUERY_KEYS: {
    matches: ['matches'],
    messages: (matchId: string) => ['matches', matchId, 'messages'],
  },
  useMessagesQuery: () => ({ data: { messages: [], olderCursor: null, hasMore: false }, refetch: vi.fn() }),
  useMatchesQuery: () => ({ data: [{ id: 'match-42', user: { id: 'user-2', name: 'Kontrollü Üye', photos: [] } }] }),
  useEditMessageMutation: () => ({ mutate: vi.fn() }),
  useDeleteMessageMutation: () => ({ mutate: vi.fn() }),
  useMarkViewOnceMutation: () => ({ mutate: vi.fn() }),
  useUnmatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  fetchOlderMessages: vi.fn(),
}));

vi.mock('../src/services/socket/socketService', () => ({
  socketService: {
    joinConversation: vi.fn(),
    leaveConversation: vi.fn(),
    markMessagesRead: vi.fn(),
    queryPresence: vi.fn(),
    on: vi.fn(() => () => {}),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    sendMessage: vi.fn(),
    reactToMessage: vi.fn(),
  },
}));

vi.mock('../src/services/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { autoTranslateEnabled: true, resolvedTranslationLanguage: 'tr' } })),
    post: vi.fn(),
  },
}));

vi.mock('../src/features/gifts/GiftShopSheet', () => ({ GiftShopSheet: () => null }));
vi.mock('../src/features/gifts/GiftCelebrationOverlay', () => ({ GiftCelebrationOverlay: () => null }));

import { ChatScreen } from '../src/features/chat/ChatScreen';
import { useAuthStore } from '../src/stores/useAuthStore';

describe('chat header navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'me', name: 'Test Kullanıcı' } as any });
  });

  it('opens the matched profile when the avatar/name row is tapped', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/chat/match-42']}>
          <Routes>
            <Route path="/chat/:matchId" element={<ChatScreen />} />
            <Route path="/discover/:userId" element={<div>Eşleşme profili açıldı</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: "Open Kontrollü Üye's profile" }));
    expect(screen.getByText('Eşleşme profili açıldı')).toBeTruthy();
  });
});

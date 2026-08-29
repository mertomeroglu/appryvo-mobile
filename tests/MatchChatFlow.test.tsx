import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MatchModal } from '../src/components/MatchModal';
import { ConversationRow } from '../src/features/chat/MessagesScreen';
import { useAppLocaleStore } from '../src/i18n/appLocale';

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), 'src', relativePath), 'utf8');

describe('match to live chat flow', () => {
  it('offers both post-match choices and opens the new conversation', () => {
    // RYVO PATCH V2 04: MatchModal now renders real, locale-aware copy (previously hardcoded
    // Turkish) -- jsdom's default navigator.language resolves to 'en-US', so without pinning the
    // locale here this test would (correctly, per the new locale-priority logic) render English
    // instead of the Turkish text this test asserts. Pinned to 'tr' to keep testing the same
    // strings as before; the underlying flow being tested (match -> chat) is locale-independent.
    useAppLocaleStore.getState().setLocale('tr');
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <Routes>
          <Route path="/discover" element={<MatchModal isOpen onClose={onClose} matchedUser={{ name: 'Kontrollü Üye' }} matchId="match-42" />} />
          <Route path="/chat/:matchId" element={<div>Canlı sohbet açıldı</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Yeni Eşleşme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keşfe Devam Et' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mesaj Yaz' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Canlı sohbet açıldı')).toBeTruthy();
  });

  it('keeps match creation, message deltas, unread and reconnect room joins live', () => {
    const realtime = source('components/RealtimeSync.tsx');
    const socket = source('services/socket/socketService.ts');
    const messages = source('features/chat/MessagesScreen.tsx');
    const chat = source('features/chat/ChatScreen.tsx');

    expect(realtime).toContain("socketService.on('match:new'");
    expect(realtime).toContain("socketService.on('match:updated'");
    expect(realtime).toContain("socketService.on('unread:count'");
    expect(socket).toContain('conversationRooms');
    expect(socket).toContain("this.socket?.emit('join:conversation', matchId)");
    expect(messages).toContain("t('msgsSwipeToMarkReadHint')");
    expect(chat).toContain("socketService.on('message:received'");
    expect(chat).toContain("socketService.on('message:edit'");
    expect(chat).toContain("socketService.on('message:delete'");
    expect(chat).toContain('queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId)');
    expect(chat).toContain("t('chatOpenProfileAriaLabelTemplate')");
  });

  it('uses the server paging cursor instead of treating a message id as a cursor', () => {
    const queries = source('hooks/useQueries.ts');
    expect(queries).toContain('&cursor=${encodeURIComponent(cursor)}');
    expect(queries).not.toContain('&before=${encodeURIComponent(beforeMessageId)}');
  });

  it('exposes only the supported safe row action', () => {
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <ConversationRow
        match={{ id: 'match-42', unreadCount: 2, lastMessage: 'Merhaba', user: { id: 'user-2', name: 'Kontrollü Üye' } }}
        online
        onOpen={onOpen}
        onMarkRead={onMarkRead}
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kontrollü Üye sohbetini aç' }), { clientX: 160 });
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Kontrollü Üye sohbetini aç' }), { clientX: 60 });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Kontrollü Üye sohbetini aç' }), { clientX: 60 });
    fireEvent.click(screen.getByRole('button', { name: 'Kontrollü Üye sohbetini okundu işaretle' }));

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(source('features/chat/MessagesScreen.tsx')).not.toContain('Sohbeti Sil');
  });
});

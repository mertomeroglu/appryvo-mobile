import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConnectionMadeSheet } from '../src/features/social/ConnectionMadeSheet';
import { ConversationRow } from '../src/features/chat/MessagesScreen';
import { useAppLocaleStore } from '../src/i18n/appLocale';

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), 'src', relativePath), 'utf8');

describe('match to live chat flow', () => {
  it('an accepted connection shows a neutral sheet that opens the new conversation', () => {
    useAppLocaleStore.getState().setLocale('tr');
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/inbox/questions']}>
        <Routes>
          <Route path="/inbox/questions" element={<ConnectionMadeSheet isOpen onClose={onClose} person={{ name: 'Kontrollü Üye' }} conversationId="match-42" />} />
          <Route path="/chat/:matchId" element={<div>Canlı sohbet açıldı</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Bağlantı kuruldu')).toBeTruthy();
    expect(screen.queryByText('Yeni Eşleşme')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sonra' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sohbete başla/ }));
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

import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, BadgeCheck, LockKeyhole, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../../components/ui/AppLogo';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatMessageDay } from '../../lib/formatMessageTime';
import { useMarkOfficialNotificationsReadMutation, useOfficialRyvoMessagesQuery } from '../../hooks/useQueries';
import { buildOfficialRyvoThread, officialMessageTimestamp } from './officialRyvo';
import { MessageBubble, type ChatMessage } from './MessageBubble';

function isSameOfficialGroup(first: any, second: any) {
  if (!first || !second) return false;
  const firstTime = new Date(officialMessageTimestamp(first)).getTime();
  const secondTime = new Date(officialMessageTimestamp(second)).getTime();
  return Number.isFinite(firstTime) && Number.isFinite(secondTime) && Math.abs(secondTime - firstTime) <= 5 * 60 * 1000;
}

export const OfficialRyvoThread: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useOfficialRyvoMessagesQuery();
  const markRead = useMarkOfficialNotificationsReadMutation();
  const markedUnreadSignatureRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () => buildOfficialRyvoThread(data?.pages.flatMap((page) => Array.isArray(page?.notifications) ? page.notifications : []) || []),
    [data?.pages]
  );

  useEffect(() => {
    const signature = messages.filter((message) => !message.is_read).map((message) => message.id).join(',');
    if (!signature || signature === markedUnreadSignatureRef.current) return;
    markedUnreadSignatureRef.current = signature;
    markRead.mutate();
  }, [markRead, messages]);

  const latestMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!latestMessageId) return;
    window.requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }));
  }, [latestMessageId]);

  return (
    <div className="flex h-full w-full flex-col bg-app text-app select-none">
      <header className="pt-safe flex min-h-16 shrink-0 items-center gap-2.5 border-b border-app bg-surface-95 px-3 backdrop-blur-md">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate('/messages')}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
          <AppLogo variant="icon" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><h1 className="text-body font-black text-app">Ryvo</h1><BadgeCheck className="h-4 w-4 fill-pink-500 text-white" /></div>
          <p className="flex items-center gap-1 text-micro normal-case text-app-muted"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Resmi hesap</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-app px-3 py-3 no-scrollbar">
        <div className="mx-auto max-w-xl">
          {hasNextPage && <button type="button" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} className="mx-auto block rounded-full border border-app bg-surface px-4 py-2 text-caption font-bold text-app-muted disabled:opacity-50">{isFetchingNextPage ? 'Yükleniyor...' : 'Eski mesajları göster'}</button>}
          {isLoading ? (
            <div className="space-y-2 pt-4"><Skeleton className="h-16 w-3/5 rounded-2xl" /><Skeleton className="h-20 w-4/5 rounded-2xl" /></div>
          ) : messages.length === 0 ? (
            <EmptyState className="py-16" icon={<MessageCircle className="h-8 w-8" />} title="Henüz Ryvo Mesajı Yok" subtitle="Hesabınla ilgili önemli ve güvenli bilgilendirmeler burada görünür." />
          ) : messages.map((message, index) => {
            const timestamp = officialMessageTimestamp(message);
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const previousTimestamp = previous ? officialMessageTimestamp(previous) : '';
            const showDay = !previousTimestamp || new Date(previousTimestamp).toDateString() !== new Date(timestamp).toDateString();
            const chatMessage: ChatMessage = {
              id: message.id,
              matchId: 'official-ryvo',
              senderId: 'official-ryvo',
              title: message.title && message.title !== 'Ryvo' ? message.title : undefined,
              text: message.body,
              messageType: 'TEXT',
              createdAt: timestamp,
            };
            return (
              <React.Fragment key={message.id}>
                {showDay && (
                  <div className="flex justify-center py-3">
                    <time className="rounded-full bg-app-secondary px-3 py-1 text-micro font-bold normal-case text-app-muted" dateTime={timestamp}>{formatMessageDay(timestamp)}</time>
                  </div>
                )}
                <MessageBubble
                  message={chatMessage}
                  isMe={false}
                  readOnly
                  senderAvatar={<span className="grid h-7 w-7 place-items-center rounded-full bg-white"><AppLogo variant="icon" size="sm" /></span>}
                  isFirstInGroup={showDay || !isSameOfficialGroup(previous, message)}
                  isLastInGroup={!isSameOfficialGroup(message, next)}
                />
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-app bg-surface-95 px-4 pt-2.5 pb-[calc(var(--safe-bottom)+10px)]">
        <div className="mx-auto flex max-w-xl items-center justify-center gap-1.5 text-micro font-semibold normal-case text-app-muted">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0" /> Bu, Ryvo’dan gelen güvenli ve tek yönlü bir konuşmadır.
        </div>
      </footer>
    </div>
  );
};

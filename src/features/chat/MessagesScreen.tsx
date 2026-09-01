import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CheckCheck, MessageCircle, Phone, Search, UserPlus } from 'lucide-react';
import { connectText } from '../connect/connectLocale';
import { QUERY_KEYS, useInAppNotificationsQuery, useMatchesQuery } from '../../hooks/useQueries';
import { getPhotoUrl } from '../../services/media/mediaService';
import { socketService } from '../../services/socket/socketService';
import { formatMessageTime } from '../../lib/formatMessageTime';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { AppLogo } from '../../components/ui/AppLogo';
import { StoryTray } from '../../components/StoryTray';
import { buildOfficialRyvoThread, officialMessageTimestamp } from './officialRyvo';
import { useAppTranslation } from '../../i18n/appLocale';

const ConfessionsScreen = lazy(() => import('../social/ConfessionsScreen').then((module) => ({
  default: module.ConfessionsScreen,
})));

type HubMode = 'chats' | 'confessions';

interface ConversationRowProps {
  match: any;
  online: boolean;
  onOpen: () => void;
  onMarkRead: () => void;
}

export const ConversationRow: React.FC<ConversationRowProps> = ({ match, online, onOpen, onMarkRead }) => {
  const { t } = useAppTranslation();
  const [actionOpen, setActionOpen] = useState(false);
  const user = match.user || match;
  const unreadCount = Number(match.unreadCount || 0);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setActionOpen(unreadCount > 0 && (info.offset.x < -38 || info.velocity.x < -350));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {unreadCount > 0 && (
        <button
          type="button"
          aria-label={t('msgsMarkReadAriaLabelTemplate').replace('{name}', user.name)}
          onClick={() => {
            onMarkRead();
            setActionOpen(false);
          }}
          className="absolute inset-y-0 right-0 grid w-[78px] place-items-center rounded-r-2xl bg-emerald-500 text-white"
        >
          <span className="flex flex-col items-center gap-1 text-micro font-extrabold normal-case">
            <CheckCheck className="h-5 w-5" />
            {t('msgsMarkAsReadLabel')}
          </span>
        </button>
      )}

      <motion.button
        type="button"
        aria-label={t('msgsOpenChatAriaLabelTemplate').replace('{name}', user.name)}
        drag={unreadCount > 0 ? 'x' : false}
        dragConstraints={{ left: -78, right: 0 }}
        dragElastic={0.04}
        dragMomentum={false}
        animate={{ x: actionOpen ? -78 : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (actionOpen) setActionOpen(false);
          else onOpen();
        }}
        // An opaque base (bg-surface) is required here, not just a translucent pink tint: this
        // row sits directly on top of the green "Okundu" swipe-reveal button (an absolutely
        // positioned sibling filling the same w-[78px] on the right), and a <50%-alpha
        // background lets that solid button bleed through underneath at rest -- visible right
        // under the timestamp/unread-count badge, which both sit at that same right edge. The
        // tint itself now lives on its own overlay layer inside this now-opaque button instead.
        className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-surface px-2.5 py-3 text-start transition-colors active:bg-surface-elevated ${unreadCount > 0 ? 'touch-pan-y' : ''}`}
      >
        {unreadCount > 0 && <span aria-hidden="true" className="absolute inset-0 bg-pink-500/[0.055]" />}

        <ProfileAvatarFrame
          photoUrl={getPhotoUrl(user.photos?.[0]) || user.photoUrl}
          name={user.name}
          activeFrameId={user.activeFrameId}
          size="md"
          online={online}
          countryCode={user.countryCode}
          showCountryFlag
          className="relative"
        />

        <span className="relative min-w-0 flex-1">
          <span className="mb-0.5 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className={`truncate text-body text-app ${unreadCount > 0 ? 'font-black' : 'font-bold'}`}>
                {user.name}
              </span>
              {online && (
                <span className="flex shrink-0 items-center gap-1 text-micro font-bold normal-case text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {t('msgsOnlineLabel')}
                </span>
              )}
            </span>
            <time className={`shrink-0 text-micro normal-case ${unreadCount > 0 ? 'font-bold text-pink-500' : 'text-app-muted'}`}>
              {match.lastMessageTime ? formatMessageTime(match.lastMessageTime) : t('msgsNewLabel')}
            </time>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-caption normal-case ${unreadCount > 0 ? 'font-semibold text-app' : 'text-app-muted'}`}>
              {match.lastMessage || t('msgsStartChatPrompt')}
            </span>
            {unreadCount > 0 && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-pink-500 px-1.5 text-micro font-black text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        </span>
      </motion.button>
    </div>
  );
};

export const MessagesScreen: React.FC = () => {
  const { t, locale } = useAppTranslation();
  const { data: matches, isLoading } = useMatchesQuery();
  const { data: notificationData } = useInAppNotificationsQuery();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const mode: HubMode = searchParams.get('tab') === 'confessions' ? 'confessions' : 'chats';

  const setMode = (next: HubMode) => {
    setSearchParams(next === 'confessions' ? { tab: 'confessions' } : {}, { replace: true });
    setSearchQuery('');
  };

  const matchItems = useMemo(() => matches || [], [matches]);
  const officialMessages = useMemo(
    () => buildOfficialRyvoThread(Array.isArray(notificationData?.notifications) ? notificationData.notifications : []),
    [notificationData?.notifications]
  );
  const latestOfficialMessage = officialMessages[officialMessages.length - 1];
  const officialUnread = officialMessages.filter((message) => !message.is_read).length;

  useEffect(() => {
    const partnerIds = matchItems.map((match: any) => (match.user || match)?.id).filter(Boolean);
    partnerIds.forEach((id: string) => socketService.queryPresence(id));
    const unsubscribe = socketService.on('user:presence', (data) => {
      setPresenceMap((previous) => ({ ...previous, [data.targetUserId]: data.isOnline }));
    });
    return unsubscribe;
  }, [matchItems]);

  const filteredMatches = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!query) return matchItems;
    return matchItems.filter((match: any) => {
      const user = match.user || match;
      return user.name?.toLocaleLowerCase('tr-TR').includes(query)
        || match.lastMessage?.toLocaleLowerCase('tr-TR').includes(query);
    });
  }, [matchItems, searchQuery]);

  const isOnline = (user: any) => presenceMap[user?.id] ?? user?.isOnline ?? false;

  const markConversationRead = (matchId: string) => {
    socketService.markMessagesRead(matchId);
    queryClient.setQueryData<any[]>(QUERY_KEYS.matches, (current) => (
      Array.isArray(current)
        ? current.map((match) => match.id === matchId ? { ...match, unreadCount: 0, unread_count: 0 } : match)
        : current
    ));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-app px-4 pb-24 text-app no-scrollbar select-none">
      <header className="pt-safe mb-2 shrink-0">
        <div className="mb-3 flex items-end justify-between pt-2">
          <div className="flex items-center gap-2.5">
            <AppLogo variant="icon" size="sm" />
            <div>
              <p className="text-micro font-extrabold uppercase tracking-[0.18em] text-pink-500">{t('msgsHeaderEyebrow')}</p>
              <h1 className="text-title text-app">{t('messages')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/calls')} aria-label={t('callHistoryLabel')} className="flex h-9 w-9 items-center justify-center rounded-full border border-app bg-surface text-app-muted"><Phone className="h-4 w-4" /></button>
            {mode === 'chats' && matchItems.length > 0 && (
              <span className="rounded-full border border-app bg-surface px-2.5 py-1 text-micro font-bold normal-case text-app-muted">
                {t('msgsConversationCountTemplate').replace('{count}', String(matchItems.length))}
              </span>
            )}
            {/* Connect Pass inbox entry point -- deliberately not a third tab next to
                Chats/Confessions (Confessions must stay unchanged), just a discoverable icon. */}
            <button
              type="button"
              onClick={() => navigate('/connect/inbox')}
              aria-label={connectText(locale, 'connectInboxTitle')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-app bg-surface text-app-muted"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-app bg-surface p-1 shadow-soft" role="tablist" aria-label={t('msgsSectionAriaLabel')}>
          <button id="messages-chats-tab" type="button" role="tab" aria-selected={mode === 'chats'} aria-controls="messages-chats-panel" onClick={() => setMode('chats')} className={`rounded-xl px-4 py-2.5 text-caption font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mode === 'chats' ? 'bg-brand-gradient text-white shadow-soft' : 'text-app-muted'}`}>{t('msgsChatsTabLabel')}</button>
          <button id="messages-confessions-tab" type="button" role="tab" aria-selected={mode === 'confessions'} aria-controls="messages-confessions-panel" onClick={() => setMode('confessions')} className={`rounded-xl px-4 py-2.5 text-caption font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mode === 'confessions' ? 'bg-brand-gradient text-white shadow-soft' : 'text-app-muted'}`}>{t('confessionsTitle')}</button>
        </div>

        {mode === 'chats' && (
          <label className="relative mt-3 block w-full">
            <span className="sr-only">{t('msgsSearchPlaceholder')}</span>
            <Search className="absolute start-4 top-3.5 h-4 w-4 text-app-muted" />
            <input type="search" placeholder={t('msgsSearchPlaceholder')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full rounded-2xl border border-app bg-input-app py-2.5 ps-11 pe-4 text-body font-semibold text-app placeholder:text-app-muted focus:border-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
        )}
      </header>

      {mode === 'confessions' ? (
        <section id="messages-confessions-panel" role="tabpanel" aria-labelledby="messages-confessions-tab">
          <Suspense fallback={<div className="px-4 py-6"><Skeleton variant="card" className="h-36 w-full" /></div>}>
            <ConfessionsScreen embedded />
          </Suspense>
        </section>
      ) : (
        <section id="messages-chats-panel" role="tabpanel" aria-labelledby="messages-chats-tab">
          {!searchQuery && <StoryTray />}

          {matchItems.some((match: any) => isOnline(match.user || match)) && !searchQuery && (
            <section className="my-3">
              <h2 className="mb-3 text-micro font-extrabold uppercase tracking-wider text-app-muted">{t('msgsOnlineNowHeading')}</h2>
              <div className="flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
                {matchItems.filter((match: any) => isOnline(match.user || match)).map((match: any) => {
                  const user = match.user || match;
                  return (
                    <button key={match.id} type="button" onClick={() => navigate(`/chat/${match.id}`)} className="flex shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95">
                      <ProfileAvatarFrame photoUrl={getPhotoUrl(user.photos?.[0]) || user.photoUrl} name={user.name} activeFrameId={user.activeFrameId} size="lg" online countryCode={user.countryCode} showCountryFlag />
                      <span className="max-w-16 truncate text-caption font-bold text-app">{user.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="my-2 space-y-1" aria-label={t('msgsListAriaLabel')}>
            {latestOfficialMessage && !searchQuery && (
              <button type="button" onClick={() => navigate('/messages/ryvo')} className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-3 text-start transition-colors active:bg-surface-elevated ${officialUnread ? 'bg-pink-500/[0.065]' : 'bg-transparent'}`}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white"><AppLogo variant="icon" size="md" /></span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-body font-black text-app">{t('appTitle')}</span><BadgeCheck className="h-4 w-4 shrink-0 fill-pink-500 text-white" /><span className="rounded-full bg-app-secondary px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-app-muted">{t('msgsOfficialBadgeLabel')}</span></span>
                    <time className={`shrink-0 text-micro normal-case ${officialUnread ? 'font-bold text-pink-500' : 'text-app-muted'}`}>{formatMessageTime(officialMessageTimestamp(latestOfficialMessage))}</time>
                  </span>
                  <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-caption normal-case ${officialUnread ? 'font-semibold text-app' : 'text-app-muted'}`}>{latestOfficialMessage.body}</span>{officialUnread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1.5 text-micro font-black text-white">{officialUnread > 99 ? '99+' : officialUnread}</span>}</span>
                </span>
              </button>
            )}

            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex items-center gap-3 rounded-2xl px-2.5 py-3"><Skeleton variant="avatar" /><div className="flex-1 space-y-2"><Skeleton variant="text" className="w-1/3" /><Skeleton variant="text" className="h-3 w-2/3" /></div></div>)
            ) : filteredMatches.length === 0 ? (
              <div className="px-2 py-8"><EmptyState className="py-8" icon={<MessageCircle className="h-8 w-8" />} title={searchQuery ? t('msgsNoResultsTitle') : t('msgsNoChatsTitle')} subtitle={searchQuery ? t('msgsNoResultsSubtitle') : t('msgsNoChatsSubtitle')} actionLabel={searchQuery ? undefined : t('msgsGoToDiscoverAction')} onAction={searchQuery ? undefined : () => navigate('/discover')} /></div>
            ) : (
              filteredMatches.map((match: any) => {
                const user = match.user || match;
                return <ConversationRow key={match.id} match={match} online={isOnline(user)} onOpen={() => navigate(`/chat/${match.id}`)} onMarkRead={() => markConversationRead(match.id)} />;
              })
            )}
          </section>

          {!searchQuery && filteredMatches.some((match: any) => Number(match.unreadCount || 0) > 0) && (
            <p className="mt-3 text-center text-micro normal-case text-app-muted">{t('msgsSwipeToMarkReadHint')}</p>
          )}
        </section>
      )}
    </div>
  );
};

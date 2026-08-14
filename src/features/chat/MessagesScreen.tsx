import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMatchesQuery } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { socketService } from '../../services/socket/socketService';
import { formatMessageTime } from '../../lib/formatMessageTime';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Avatar } from '../../components/ui/Avatar';
import { AppLogo } from '../../components/ui/AppLogo';

export const MessagesScreen: React.FC = () => {
  const { data: matches, isLoading } = useMatchesQuery();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});

  const matchItems = useMemo(() => matches || [], [matches]);

  useEffect(() => {
    const unsubMatch = socketService.on('match:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    });
    return () => unsubMatch();
  }, [queryClient]);

  // Real live presence for every conversation partner (not just a static snapshot field).
  useEffect(() => {
    const partnerIds = matchItems
      .map((m: any) => (m.user || m)?.id)
      .filter(Boolean);
    partnerIds.forEach((id: string) => socketService.queryPresence(id));

    const unsub = socketService.on('user:presence', (data) => {
      setPresenceMap((prev) => ({ ...prev, [data.targetUserId]: data.isOnline }));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchItems.length]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchItems;
    return matchItems.filter((m: any) => {
      const u = m.user || m;
      return u.name?.toLowerCase().includes(q) || m.lastMessage?.toLowerCase().includes(q);
    });
  }, [matchItems, searchQuery]);

  const isOnline = (u: any) => presenceMap[u?.id] ?? u?.isOnline ?? false;

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-24 select-none">
      {/* Search Header */}
      <header className="pt-safe my-2">
        <div className="flex items-center gap-2.5 mb-3">
          <AppLogo variant="icon" size="sm" />
          <h2 className="text-title text-app">Mesajlar</h2>
        </div>
        <div className="relative w-full">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-app-muted" />
          <input
            type="text"
            placeholder="Sohbetlerde ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-input-app border border-app rounded-2xl pl-11 pr-4 py-2.5 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500"
          />
        </div>
      </header>

      {/* Online Now Row */}
      {matchItems.some((m: any) => isOnline(m.user || m)) && !searchQuery && (
        <div className="my-3">
          <h4 className="text-micro text-app-muted uppercase tracking-wider mb-3">Şu An Çevrimiçi</h4>
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
            {matchItems
              .filter((m: any) => isOnline(m.user || m))
              .map((m: any) => {
                const u = m.user || m;
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/chat/${m.id}`)}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform"
                  >
                    <div className="p-0.5 rounded-full bg-brand-gradient shadow-soft">
                      <Avatar
                        src={u.photoUrl || u.photos?.[0]?.url ? normalizeMediaUrl(u.photoUrl || u.photos?.[0]?.url) : undefined}
                        name={u.name}
                        size="lg"
                        online
                      />
                    </div>
                    <span className="text-caption font-bold text-app truncate max-w-[64px]">{u.name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="my-2 space-y-2">
        <h4 className="text-micro text-app-muted uppercase tracking-wider mb-2">Sohbetler</h4>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton variant="avatar" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-1/3" />
                <Skeleton variant="text" className="w-2/3 h-3" />
              </div>
            </div>
          ))
        ) : filteredMatches.length === 0 ? (
          <div className="my-auto py-12">
            <EmptyState
              icon="💬"
              title={searchQuery ? 'Sonuç Bulunamadı' : 'Henüz Sohbet Yok'}
              subtitle={
                searchQuery
                  ? 'Farklı bir isim veya kelime ile tekrar dene.'
                  : 'Eşleştiğin kişilerle mesajlaşmaya burada başlayabilirsin.'
              }
              actionLabel={searchQuery ? undefined : 'Keşfet\'e Git'}
              onAction={searchQuery ? undefined : () => navigate('/discover')}
            />
          </div>
        ) : (
          filteredMatches.map((m: any) => {
            const u = m.user || m;
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/chat/${m.id}`)}
                className="w-full p-2.5 rounded-2xl bg-surface border border-app flex items-center gap-3 hover:bg-surface-elevated active:scale-[0.99] transition-all text-left shadow-soft"
              >
                <Avatar
                  src={u.photoUrl || u.photos?.[0]?.url ? normalizeMediaUrl(u.photoUrl || u.photos?.[0]?.url) : undefined}
                  name={u.name}
                  size="md"
                  online={isOnline(u)}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className={`text-caption truncate ${m.unreadCount > 0 ? 'font-black text-app' : 'font-bold text-app'}`}>
                      {u.name}
                    </h4>
                    <span className="text-micro text-app-muted normal-case shrink-0 ml-2">
                      {m.lastMessageTime ? formatMessageTime(m.lastMessageTime) : 'Yeni'}
                    </span>
                  </div>
                  <p
                    className={`text-micro truncate normal-case ${
                      m.unreadCount > 0 ? 'text-app font-semibold' : 'text-app-muted'
                    }`}
                  >
                    {m.lastMessage || 'Sohbete başla...'}
                  </p>
                </div>

                {m.unreadCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-micro font-extrabold flex items-center justify-center shrink-0">
                    {m.unreadCount > 9 ? '9+' : m.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

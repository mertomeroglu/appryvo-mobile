import React, { useEffect, useMemo, useRef } from 'react';
import { formatDisplayAge } from '../../lib/profileLabels';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, UserMinus, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, useFollowersQuery, useFollowingQuery } from '../../hooks/useQueries';
import { useAuthStore } from '../../stores/useAuthStore';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../../components/ui/Avatar';
import { VerifiedBadge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAppTranslation } from '../../i18n/appLocale';
import { apiClient } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';

type Tab = 'followers' | 'following';

/** Shared list for both "Bağlantılarım" (own profile) and "Bağlantılar" (someone else's profile)
 * -- same screen, same API, only the header copy and self-navigation target change. */
export const ConnectionsListScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selfId = useAuthStore((s) => s.user?.id);
  const isSelf = !!userId && userId === selfId;
  const queryClient = useQueryClient();
  const tab: Tab = searchParams.get('tab') === 'following' ? 'following' : 'followers';

  const followers = useFollowersQuery(userId);
  const following = useFollowingQuery(userId);
  const active = tab === 'followers' ? followers : following;
  const items = useMemo(() => active.data?.pages.flatMap((page) => page.items) || [], [active.data]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && active.hasNextPage && !active.isFetchingNextPage) {
        active.fetchNextPage();
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active.hasNextPage, active.isFetchingNextPage, active.fetchNextPage]);

  const setTab = (next: Tab) => setSearchParams(next === 'following' ? { tab: 'following' } : {}, { replace: true });

  const openProfile = (targetId: string) => {
    navigate(targetId === selfId ? '/profile' : `/discover/${targetId}`);
  };

  const runConnectionAction = async (targetId: string, action: 'remove' | 'unfollow' | 'block') => {
    try {
      if (action === 'remove') await apiClient.delete(`/api/follows/followers/${targetId}`);
      else if (action === 'unfollow') await apiClient.delete(`/api/follows/${targetId}`);
      else await apiClient.post('/api/blocks', { targetUserId: targetId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.followers(userId || '') }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.following(userId || '') }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.followStatus(userId || '') }),
      ]);
    } catch (error: any) {
      toast.error(error?.message || t('safetyActionFailedError'));
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-app text-app select-none">
      <header className="pt-safe shrink-0 border-b border-app px-4 pb-3">
        <div className="flex items-center gap-3 py-3">
          <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="md" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <h1 className="text-heading text-app">{isSelf ? t('myConnectionsTitle') : t('connectionsTitle')}</h1>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-app bg-surface p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'followers'}
            onClick={() => setTab('followers')}
            className={`rounded-xl px-4 py-2.5 text-caption font-extrabold ${tab === 'followers' ? 'bg-brand-gradient text-white' : 'text-app-muted'}`}
          >
            {t('followersTabLabel')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'following'}
            onClick={() => setTab('following')}
            className={`rounded-xl px-4 py-2.5 text-caption font-extrabold ${tab === 'following' ? 'bg-brand-gradient text-white' : 'text-app-muted'}`}
          >
            {t('followingTabLabel')}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-24">
        {active.isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton variant="avatar" />
                <Skeleton variant="text" className="w-1/2" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icon={<Users className="w-8 h-8" />}
              title={tab === 'followers' ? t('noFollowersTitle') : t('noFollowingTitle')}
              subtitle={
                tab === 'followers'
                  ? t('noFollowersSubtitle')
                  : t('noFollowingSubtitle')
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-app">
            {items.map((item) => (
              <div
                key={item.userId}
                className="flex w-full items-center gap-3 py-3 text-start active:bg-surface-elevated"
              >
                <button type="button" onClick={() => openProfile(item.userId)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                  <Avatar src={item.photoUrl ? normalizeMediaUrl(item.photoUrl) : undefined} name={item.name} size="md" />
                  <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-body font-bold text-app">{item.name}</span>
                    {formatDisplayAge(item.age) !== undefined ? <span className="text-caption text-app-muted">{formatDisplayAge(item.age)}</span> : null}
                    {item.verified && <VerifiedBadge size={16} />}
                  </span>
                  </span>
                </button>
                {isSelf && (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" aria-label={t('removeButtonLabel')} onClick={() => void runConnectionAction(item.userId, tab === 'followers' ? 'remove' : 'unfollow')} className="rounded-full p-2 text-app-muted"><UserMinus className="h-4 w-4" /></button>
                    <button type="button" aria-label={t('blockUser')} onClick={() => void runConnectionAction(item.userId, 'block')} className="rounded-full p-2 text-red-500"><Ban className="h-4 w-4" /></button>
                  </span>
                )}
              </div>
            ))}
            <div ref={sentinelRef} className="h-8" />
            {active.isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-pink-500 border-r-purple-500 border-b-transparent border-l-transparent" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

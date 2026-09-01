import {
  keepPreviousData,
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from '../services/api/apiClient';
import { normalizePublicTier } from '../features/premium/subscriptionProducts';

export interface MapBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Query Keys Constant
export const QUERY_KEYS = {
  me: ['user', 'me'],
  entitlements: ['user', 'entitlements'],
  discoveryFeed: ['discovery', 'feed'],
  discoveryMap: (bbox?: MapBbox | null) => ['discovery', 'map', bbox?.north, bbox?.south, bbox?.east, bbox?.west],
  inboundLikes: ['discovery', 'likes', 'inbound'],
  matches: ['matches'],
  messages: (matchId: string) => ['matches', matchId, 'messages'],
  confessions: ['social', 'confessions'],
  frames: ['profile', 'frames'],
  frameOwnership: ['profile', 'frames', 'ownership'],
  callHistory: ['calls', 'history'],
  notifications: ['notifications', 'in-app'],
  stories: ['social', 'stories'],
  followStatus: (userId: string) => ['follows', userId, 'status'],
  followers: (userId: string) => ['follows', userId, 'followers'],
  following: (userId: string) => ['follows', userId, 'following'],
  trustProfile: (userId: string) => ['trust', 'profile', userId],
  meetingStatus: (matchId: string) => ['trust', 'meetings', matchId, 'status'],
};

// Hooks

export function useMeQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => apiClient.get('/api/me').then((res) => res?.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntitlementsQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.entitlements,
    queryFn: () => apiClient.get('/api/entitlements').then((res) => {
      const data = res?.data || {};
      return { ...data, subscriptionTier: normalizePublicTier(data.subscriptionTier) };
    }),
    staleTime: 2 * 60 * 1000,
  });
}

export interface DiscoveryFeedPage<TProfile = any> {
  profiles: TProfile[];
  paging: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  algorithmVersion?: string;
}

export interface ConfessionItem {
  id: string;
  text: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  isLikedByMe: boolean;
  isMyPost: boolean;
}

export interface ConfessionsPage {
  items: ConfessionItem[];
  isQuotaExceeded: boolean;
  quota: { limit: number; current: number } | null;
  paging: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export function useDiscoveryFeedQuery(cursor: string | null, limit = 20, sessionKey = 0) {
  return useQuery({
    queryKey: [...QUERY_KEYS.discoveryFeed, sessionKey, cursor, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return apiClient.get(`/api/discovery/feed?${params.toString()}`).then((res) => ({
        profiles: Array.isArray(res?.data) ? res.data : [],
        paging: {
          limit: Number(res?.paging?.limit) || limit,
          hasMore: res?.paging?.hasMore === true,
          nextCursor: typeof res?.paging?.nextCursor === 'string' ? res.paging.nextCursor : null,
        },
        algorithmVersion: res?.algorithmVersion,
      } as DiscoveryFeedPage));
    },
    staleTime: 1 * 60 * 1000,
  });
}

export function useDiscoveryUserQuery(userId?: string) {
  return useQuery({
    queryKey: ['discovery', 'users', userId],
    queryFn: () => apiClient.get(`/api/discovery/users/${userId}`).then((res) => res?.data),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

// The backend only filters by viewport (north/south/east/west) — it never reads lat/lng/radius —
// so the map query is keyed on the current viewport bounds, refetched as the user pans/zooms.
export function useDiscoveryMapQuery(bbox?: MapBbox | null, limit = 80) {
  return useQuery({
    queryKey: QUERY_KEYS.discoveryMap(bbox),
    queryFn: () => {
      const params = new URLSearchParams();
      if (bbox) {
        params.set('north', String(bbox.north));
        params.set('south', String(bbox.south));
        params.set('east', String(bbox.east));
        params.set('west', String(bbox.west));
      }
      params.set('limit', String(limit));
      return apiClient.get(`/api/discovery/map?${params.toString()}`).then((res) => res?.data);
    },
    enabled: !!bbox,
    // A user who taps "Gizlen" (hide) is removed from GET /api/discovery/map's result
    // immediately server-side, but this query previously had no refetch trigger at all beyond
    // the bbox changing (panning/zooming) -- the app disables the QueryClient's global
    // refetchOnWindowFocus (main.tsx), and there was no refetchInterval either. A viewer who
    // simply holds the map still would keep seeing a since-hidden user's marker indefinitely,
    // not just briefly stale. Polling every 15s while the map is actually mounted (this query is
    // only `enabled` once the screen has a bbox, and React Query stops polling once it's
    // unmounted/inactive) bounds that exposure window instead of leaving it open-ended.
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useInboundLikesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.inboundLikes,
    queryFn: () => apiClient.get('/api/discovery/likes/inbound').then((res) => res?.data),
    staleTime: 30 * 1000,
  });
}

export function useLikesUnreadCountQuery() {
  return useQuery({
    queryKey: ['discovery', 'likes', 'unread-count'],
    queryFn: () => apiClient.get('/api/discovery/likes/unread-count').then((res) => res?.data?.count ?? 0),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkLikesSeenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/api/discovery/likes/mark-seen'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discovery', 'likes', 'unread-count'] }),
  });
}

export function useMessagesUnreadCountQuery() {
  return useQuery({
    queryKey: ['matches', 'unread-count'],
    queryFn: () => apiClient.get('/api/matches/unread-count').then((res) => res?.data?.unreadCount ?? 0),
    staleTime: 30 * 1000,
  });
}

export function useMatchesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.matches,
    queryFn: () => apiClient.get('/api/matches').then((res) => {
      const rows = Array.isArray(res?.data) ? res.data : [];
      return rows.map((match: any) => ({
        ...match,
        id: match.id || match.match_id,
        user: match.user || match.otherUser || match.other_user || null,
      }));
    }),
    staleTime: 30 * 1000,
  });
}

export interface ChatMessagesPage<TMessage = any> {
  messages: TMessage[];
  olderCursor: string | null;
  hasMore: boolean;
  meta?: Record<string, unknown>;
}

export function useMessagesQuery(matchId: string, limit = 50) {
  return useQuery({
    queryKey: QUERY_KEYS.messages(matchId),
    queryFn: () => apiClient.get(`/api/matches/${matchId}/messages?limit=${limit}`).then((res): ChatMessagesPage => ({
      messages: Array.isArray(res?.data) ? res.data : [],
      olderCursor: res?.paging?.olderCursor || null,
      hasMore: res?.paging?.hasMore === true,
      meta: res?.meta,
    })),
    enabled: !!matchId,
    staleTime: 10 * 1000,
  });
}

/** Not a hook — fetches one older page using the opaque cursor returned by the API. */
export async function fetchOlderMessages(matchId: string, cursor: string, limit = 50): Promise<ChatMessagesPage> {
  const res = await apiClient.get(
    `/api/matches/${matchId}/messages?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
  );
  return {
    messages: Array.isArray(res?.data) ? res.data : [],
    olderCursor: res?.paging?.olderCursor || null,
    hasMore: res?.paging?.hasMore === true,
    meta: res?.meta,
  };
}

export function useConfessionsQuery(limit = 10) {
  return useInfiniteQuery({
    queryKey: [...QUERY_KEYS.confessions, limit],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set('cursor', pageParam);
      try {
        const res = await apiClient.get(`/api/social/confessions?${params.toString()}`);
        return {
          items: Array.isArray(res?.data) ? res.data : [],
          isQuotaExceeded: res?.isQuotaExceeded === true,
          quota: res?.quota || null,
          paging: res?.paging || { hasMore: false, nextCursor: null },
        } satisfies ConfessionsPage;
      } catch (error: any) {
        // Compatibility during rolling backend deployments: the previous API represented
        // an exhausted product quota as HTTP 403, which must not become a technical error UI.
        if (error?.rawDetails?.isQuotaExceeded === true) {
          return {
            items: [],
            isQuotaExceeded: true,
            quota: {
              limit: Number(error.rawDetails.limit || 10),
              current: Number(error.rawDetails.current || 10),
            },
            paging: { hasMore: false, nextCursor: null },
          } satisfies ConfessionsPage;
        }
        throw error;
      }
    },
    getNextPageParam: (lastPage) => !lastPage.isQuotaExceeded && lastPage.paging?.hasMore ? lastPage.paging.nextCursor : undefined,
    staleTime: 1 * 60 * 1000,
  });
}

export interface StoryItem {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  mediaUrl: string;
  caption?: string;
  expiresAt: string;
  createdAt: string;
  viewedByMe: boolean;
  isOwn: boolean;
  isPromoted: boolean;
}

export function useStoriesQuery(limit = 30) {
  return useQuery({
    // Response envelope is { status, data: StoryItem[], paging }, not { items }. A previous
    // version of this hook returned the raw envelope and StoryTray read a non-existent
    // `data.items`, so the tray silently rendered nothing regardless of real story data.
    queryKey: [...QUERY_KEYS.stories, limit],
    queryFn: () => apiClient.get(`/api/social/stories?limit=${limit}`).then((res) => ({
      items: Array.isArray(res?.data) ? (res.data as StoryItem[]) : [],
      paging: res?.paging || { hasMore: false, nextCursor: null },
    })),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateStoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { mediaUrl: string; caption?: string }) => apiClient.post('/api/social/stories', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.stories }),
  });
}

export function useDeleteStoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => apiClient.delete(`/api/social/stories/${storyId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.stories }),
  });
}

/** Fire-and-forget-safe: POST /stories/:id/view is idempotent server-side, so this never needs
 * to guard against being called twice for the same story (e.g. re-opening the viewer). */
export function useMarkStoryViewedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => apiClient.post(`/api/social/stories/${storyId}/view`),
    onSuccess: (_data, storyId) => {
      queryClient.setQueriesData<{ items: StoryItem[]; paging: unknown } | undefined>(
        { queryKey: QUERY_KEYS.stories },
        (existing) => {
          if (!existing?.items) return existing;
          return { ...existing, items: existing.items.map((s) => (s.id === storyId ? { ...s, viewedByMe: true } : s)) };
        }
      );
    },
  });
}

export function useStoryViewersQuery(storyId: string | null) {
  return useQuery({
    queryKey: ['social', 'stories', storyId, 'viewers'],
    queryFn: () => apiClient.get(`/api/social/stories/${storyId}/viewers`).then((res) => res?.data || []),
    enabled: !!storyId,
    staleTime: 15 * 1000,
  });
}

export interface StorySpotlightConfig {
  available: boolean;
  costCoins: number | null;
  durationHours: number | null;
}

export function useStorySpotlightConfigQuery() {
  return useQuery({
    queryKey: ['coins', 'story-spotlight', 'config'],
    queryFn: () => apiClient.get('/api/coins/story-spotlight/config').then((res) => res?.data as StorySpotlightConfig),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStorySpotlightMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { storyId: string; idempotencyKey: string }) =>
      apiClient.post('/api/coins/story-spotlight', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements }),
  });
}

export function useInitRewardSessionMutation() {
  return useMutation({
    mutationFn: (rewardType: 'REWARDED_LIKE' | 'REWARDED_SUPERLIKE' | 'REWARDED_REWIND') =>
      apiClient.post('/api/ads/reward-session/init', { rewardType }).then((res) => res?.data),
  });
}

export function useVerifyRewardSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.post('/api/ads/reward-session/verify', { sessionId }).then((res) => res?.data),
    onSuccess: (data) => {
      if (data?.granted) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements });
    },
  });
}

export function useReportStoryMutation() {
  return useMutation({
    mutationFn: ({ storyId, reason }: { storyId: string; reason: string }) =>
      apiClient.post(`/api/social/stories/${storyId}/report`, { reason }),
  });
}

export interface FollowStatus {
  userId: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  followersCount: number;
  followingCount: number;
}

export function useFollowStatusQuery(userId?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.followStatus(userId || ''),
    queryFn: () => apiClient.get(`/api/follows/${userId}/status`).then((res) => res?.data as FollowStatus),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

export interface FollowListPage {
  items: Array<{ userId: string; name: string; age?: number; verified?: boolean; photoUrl?: string | null; followedAt: string }>;
  paging: { hasMore: boolean; nextCursor: string | null };
}

function useFollowListQuery(userId: string | undefined, direction: 'followers' | 'following') {
  return useInfiniteQuery({
    queryKey: direction === 'followers' ? QUERY_KEYS.followers(userId || '') : QUERY_KEYS.following(userId || ''),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('cursor', pageParam);
      const res = await apiClient.get(`/api/follows/${userId}/${direction}?${params.toString()}`);
      return {
        items: Array.isArray(res?.data) ? res.data : [],
        paging: res?.paging || { hasMore: false, nextCursor: null },
      } satisfies FollowListPage;
    },
    getNextPageParam: (lastPage) => (lastPage.paging?.hasMore ? lastPage.paging.nextCursor : undefined),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

export function useFollowersQuery(userId?: string) {
  return useFollowListQuery(userId, 'followers');
}

export function useFollowingQuery(userId?: string) {
  return useFollowListQuery(userId, 'following');
}

/** Follow/unfollow are both idempotent server-side; the mutation itself is guarded by the
 * FollowButton disabling on `isPending` so a double tap can't fire it twice client-side either. */
export function useFollowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.post(`/api/follows/${userId}`).then((res) => res?.data as FollowStatus),
    onSuccess: (data, userId) => {
      if (data) queryClient.setQueryData(QUERY_KEYS.followStatus(userId), data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.followers(userId) });
    },
  });
}

export function useUnfollowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/api/follows/${userId}`).then((res) => res?.data as FollowStatus),
    onSuccess: (data, userId) => {
      if (data) queryClient.setQueryData(QUERY_KEYS.followStatus(userId), data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.followers(userId) });
    },
  });
}

// --- Trust Profile / Meeting Feedback -----------------------------------------------------
// See server/api/src/trust_controller.js. Public trust data is aggregate-only: below the
// server's PUBLIC_THRESHOLD, `averages` is null and only a count is returned.

export interface TrustProfile {
  userId: string;
  count: number;
  threshold: number;
  thresholdReached: boolean;
  averages: {
    communication: number;
    profileMatch: number;
    reliability: number;
    comfort: number;
    intent: number;
    listening: number;
    respect: number;
  } | null;
}

export function useTrustProfileQuery(userId?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.trustProfile(userId || ''),
    queryFn: () => apiClient.get(`/api/trust/profile/${userId}`).then((res) => res?.data as TrustProfile),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export interface MeetingStatus {
  meetingId: string | null;
  status: 'NOT_STARTED' | 'I_CONFIRMED' | 'THEY_CONFIRMED' | 'MUTUALLY_CONFIRMED';
  selfConfirmed: boolean;
  otherConfirmed: boolean;
  feedbackSubmitted: boolean;
}

export function useMeetingStatusQuery(matchId?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.meetingStatus(matchId || ''),
    queryFn: () => apiClient.get(`/api/trust/meetings/${matchId}/status`).then((res) => res?.data as MeetingStatus),
    enabled: !!matchId,
    staleTime: 15 * 1000,
    refetchInterval: matchId ? 5000 : false,
  });
}

export function useConfirmMeetingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => apiClient.post('/api/trust/meetings/confirm', { matchId }).then((res) => res?.data),
    onSuccess: (_data, matchId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.meetingStatus(matchId) });
    },
  });
}

export function useSubmitMeetingFeedbackMutation() {
  return useMutation({
    mutationFn: (payload: { meetingId: string; scores: Record<string, number> }) =>
      apiClient.post('/api/trust/feedback', payload),
  });
}

export function useConfessionCommentsQuery(confessionId: string | null) {
  return useQuery({
    queryKey: ['social', 'confessions', confessionId, 'comments'],
    queryFn: () => apiClient.get(`/api/social/confessions/${confessionId}/comments`).then((res) => res?.data),
    enabled: !!confessionId,
    staleTime: 15 * 1000,
  });
}

// The backend returns { success, unreadCount, notifications } directly, not the usual
// { status, data } envelope — read the response as-is instead of unwrapping `.data`.
export function useInAppNotificationsQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => apiClient.get('/api/notifications/in-app').then((res) => res),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/notifications/in-app/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications }),
  });
}

export function useBlockedUsersQuery() {
  return useQuery({
    queryKey: ['blocks'],
    queryFn: () => apiClient.get('/api/blocks').then((res) => res?.data),
    staleTime: 30 * 1000,
  });
}

export function useFramesQuery(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.frames,
    queryFn: () => apiClient.get('/api/profile/frames/catalog').then((res) => res?.data),
    enabled,
    // The authenticated app-level provider warms this rarely-changing catalogue once.
    // It then survives Profile -> Frames -> Profile navigation without a network refetch.
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useFrameOwnershipQuery(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.frameOwnership,
    queryFn: () => apiClient.get('/api/profile/frames/ownership').then((res) => res?.data),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useOfficialRyvoMessagesQuery(limit = 30) {
  return useInfiniteQuery({
    queryKey: [...QUERY_KEYS.notifications, 'official', limit],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set('cursor', pageParam);
      return apiClient.get(`/api/notifications/in-app/official?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage?.paging?.hasMore ? lastPage.paging.nextCursor : undefined,
    staleTime: 15 * 1000,
  });
}

export function useMarkOfficialNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.put('/api/notifications/in-app/official/read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications }),
  });
}

// Mutations

export function useLikeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    // Field name must match the backend's exact casing (`isSuperLike`, capital L) -- it reads
    // req.body via destructuring, so a mismatched key silently becomes undefined/false instead
    // of erroring, which previously made every Super Like save as a regular Like.
    mutationFn: (payload: { targetUserId: string; isSuperLike?: boolean }) =>
      apiClient.post('/api/discovery/like', payload),
    // Not invalidating discoveryFeed here: the client pages through an already-fetched
    // batch locally (see DiscoverScreen), and invalidating per-swipe used to replace that
    // batch out from under the in-progress deck. The server already excludes interacted
    // users from future fetches, so eager refetch isn't needed to stay correct.
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
      // Liking someone who is already in "Seni Beğenenler" always creates a mutual match
      // (they already liked us -- see the reciprocal check in POST /discovery/like), so they
      // must drop out of that list immediately rather than waiting for its 30s staleTime or a
      // socket round-trip to invalidate it.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboundLikes });
      if (variables.isSuperLike) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements });
      }
    },
  });
}

export function usePassMutation() {
  return useMutation({
    mutationFn: (targetUserId: string) => apiClient.post('/api/discovery/pass', { targetUserId }),
  });
}

export function useNotificationsPreferenceMutation() {
  return useMutation({
    mutationFn: (pushEnabled: boolean) =>
      apiClient.patch('/api/user/notifications-preferences', { pushEnabled }),
  });
}

export function useSupportCategoriesQuery() {
  return useQuery({
    queryKey: ['support', 'categories'],
    queryFn: () => apiClient.get('/api/support/categories').then((res) => res?.data),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateSupportTicketMutation() {
  return useMutation({
    // name/email are included directly rather than relying on the backend's own best-effort
    // Bearer-token decode (support_controller.js) to resolve them server-side -- that decode is a
    // raw, non-refreshing jwt.verify with no fallback, so a token that happens to have expired by
    // the time the user finishes composing and submits (a realistic delay for a support message)
    // silently degraded the request to "anonymous," and since this payload never carried name/
    // email itself, the request then failed its required-field check. The client already knows
    // its own authenticated user's name/email, so sending them directly removes this submission
    // from depending on token freshness at all.
    mutationFn: (payload: { category: string; subject: string; message: string; name?: string; email?: string }) =>
      apiClient.post('/api/support/ticket', payload),
  });
}

export function useEditMessageMutation(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      apiClient.patch(`/api/matches/${matchId}/messages/${messageId}`, { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(matchId) }),
  });
}

export function useDeleteMessageMutation(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => apiClient.delete(`/api/matches/${matchId}/messages/${messageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(matchId) }),
  });
}

export function useMarkViewOnceMutation(matchId: string) {
  return useMutation({
    mutationFn: (messageId: string) => apiClient.post(`/api/matches/${matchId}/messages/${messageId}/view-once`),
  });
}

export function useAddCommentMutation(confessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // parentId threads this as a reply -- see social_controller.js's POST .../comments, which
    // already accepted { text, parentId } and notified the specific parent comment's author, but
    // had no mobile UI ever producing a parentId (every comment landed top-level regardless of
    // user intent).
    mutationFn: ({ text, parentId }: { text: string; parentId?: string }) =>
      apiClient.post(`/api/social/confessions/${confessionId}/comments`, { text, parentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'confessions', confessionId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confessions });
    },
  });
}

export function useDeleteCommentMutation(confessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiClient.delete(`/api/social/confessions/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'confessions', confessionId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confessions });
    },
  });
}

export function useLikeCommentMutation(confessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiClient.post(`/api/social/confessions/comments/${commentId}/like`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'confessions', confessionId, 'comments'] }),
  });
}

export function useDeleteConfessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/social/confessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confessions }),
  });
}

export function useUnmatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => apiClient.delete(`/api/matches/${matchId}`),
    onSuccess: (_data, matchId) => {
      queryClient.setQueryData<any[]>(QUERY_KEYS.matches, (current) => (
        Array.isArray(current) ? current.filter((match) => (match.id || match.match_id) !== matchId) : current
      ));
      queryClient.removeQueries({ queryKey: QUERY_KEYS.messages(matchId) });
      queryClient.invalidateQueries({ queryKey: ['matches', 'unread-count'] });
    },
  });
}

export function useCreateConfessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiClient.post('/api/social/confessions', { text }),
    onSuccess: (response) => {
      const created = response?.data as (ConfessionItem & { moderationStatus?: string }) | undefined;
      if (!created?.id || created.moderationStatus === 'REVIEW_REQUIRED') return;

      // The create response is authoritative. Put it into every active confession feed
      // immediately instead of depending on a refetch that may legitimately return a
      // quota-only page for free users.
      queryClient.setQueriesData<InfiniteData<ConfessionsPage, string | null>>(
        { queryKey: QUERY_KEYS.confessions },
        (existing) => {
          if (!existing?.pages.length) return existing;
          const pages = existing.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== created.id),
          }));
          pages[0] = { ...pages[0], items: [created, ...pages[0].items] };
          return { ...existing, pages };
        }
      );
    },
  });
}

export function useLikeConfessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/social/confessions/${id}/like`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confessions }),
  });
}

export function useReportConfessionMutation() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/api/social/confessions/${id}/report`, { reason }),
  });
}

export function useUnblockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/api/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiClient.put('/api/profile', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
    },
  });
}

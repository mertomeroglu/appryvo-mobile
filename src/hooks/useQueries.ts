import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '../services/api/apiClient';

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
  callHistory: ['calls', 'history'],
  notifications: ['notifications', 'in-app'],
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
    queryFn: () => apiClient.get('/api/entitlements').then((res) => res?.data),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDiscoveryFeedQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...QUERY_KEYS.discoveryFeed, page, limit],
    queryFn: () => apiClient.get(`/api/discovery/feed?page=${page}&limit=${limit}`).then((res) => res?.data),
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
    staleTime: 30 * 1000,
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
    queryFn: () => apiClient.get('/api/matches').then((res) => res?.data),
    staleTime: 30 * 1000,
  });
}

export function useMessagesQuery(matchId: string, limit = 50) {
  return useQuery({
    queryKey: QUERY_KEYS.messages(matchId),
    queryFn: () => apiClient.get(`/api/matches/${matchId}/messages?limit=${limit}`).then((res) => res?.data),
    enabled: !!matchId,
    staleTime: 10 * 1000,
  });
}

/** Not a hook — a plain fetch for "load older messages" pagination (uses the real `before` cursor param). */
export async function fetchOlderMessages(matchId: string, beforeMessageId: string, limit = 50) {
  const res = await apiClient.get(
    `/api/matches/${matchId}/messages?limit=${limit}&before=${encodeURIComponent(beforeMessageId)}`
  );
  return res?.data;
}

export function useConfessionsQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...QUERY_KEYS.confessions, page, limit],
    queryFn: () => apiClient.get(`/api/social/confessions?page=${page}&limit=${limit}`).then((res) => res?.data),
    staleTime: 1 * 60 * 1000,
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

export function useFramesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.frames,
    queryFn: () => apiClient.get('/api/profile/frames').then((res) => res?.data),
    staleTime: 10 * 60 * 1000,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
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
    mutationFn: (payload: { category: string; subject: string; message: string }) =>
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
    mutationFn: (text: string) => apiClient.post(`/api/social/confessions/${confessionId}/comments`, { text }),
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

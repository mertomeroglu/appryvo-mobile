import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api/apiClient';

/**
 * Question-based matching client (API: /api/questions/*, /api/discovery/v2/*, /api/profile-questions/*).
 * The server never sends a correct option to anyone but the question owner, so nothing in these
 * types carries one for another person's question.
 */

export type QuestionOption = 'A' | 'B';

export type InteractionStatus =
  | 'QUESTION_PRESENTED'
  | 'ANSWER_WRONG'
  | 'OWNER_PENDING'
  | 'RETRY_REQUESTED'
  | 'RETRY_APPROVED'
  | 'RETRY_DECLINED'
  | 'SUPERLIKE_PENDING'
  | 'OWNER_ACCEPTED'
  | 'MATCHED'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'CLOSED';

export type AnswererAction = 'REQUEST_RETRY' | 'SUPERLIKE' | 'CLOSE' | 'ANSWER';
export type OwnerAction = 'ACCEPT' | 'PASS' | 'RETRY_APPROVE' | 'RETRY_DECLINE';

export interface QuestionPerson {
  id: string;
  name: string;
  age?: number | null;
  city?: string;
  verified?: boolean;
  photoUrl?: string;
  photoThumbnailUrl?: string;
  photoMediumUrl?: string;
}

export interface DiscoveryV2Candidate {
  id: string;
  name: string;
  age?: number | null;
  city?: string;
  bio?: string;
  job?: string;
  verified?: boolean;
  isPremium?: boolean;
  subscriptionTier?: string | null;
  goldBadgeEnabled?: boolean;
  countryCode?: string | null;
  activeFrameId?: string | null;
  photos?: Array<{ url?: string } | string>;
  photoUrl?: string;
  photoMediumUrl?: string;
  distanceKm?: number | null;
  activeNow?: boolean;
  isNewMember?: boolean;
  compatibility?: number | null;
  commonInterests?: string[];
  questionState?: { interactionId: string; status: InteractionStatus } | null;
  [key: string]: unknown;
}

export interface DiscoveryV2Page {
  profiles: DiscoveryV2Candidate[];
  paging: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export interface QuestionPresentation {
  attemptId: string;
  interactionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  expiresAt?: string;
}

export interface AnswerResult {
  result: 'CORRECT' | 'WRONG';
  interactionId: string;
  interactionStatus: InteractionStatus;
  nextActions: AnswererAction[];
}

export interface QuestionStatus {
  targetUserId: string;
  canAnswer: boolean;
  reason:
    | 'SELF'
    | 'UNAVAILABLE'
    | 'MATCHED'
    | 'IN_PROGRESS'
    | 'CLOSED'
    | 'QUESTIONS_REQUIRED'
    | 'NO_ACTIVE_QUESTION'
    | null;
  matchId?: string;
  interactionId: string | null;
  interactionStatus: InteractionStatus | null;
  nextActions: AnswererAction[];
  compatibility: number | null;
  commonInterests: string[];
}

export interface ReceivedInboxItem {
  interactionId: string;
  status: 'SUPERLIKE_PENDING' | 'OWNER_PENDING' | 'RETRY_REQUESTED';
  priority?: boolean;
  viaSuperlike: boolean;
  questionText?: string;
  actions: OwnerAction[];
  person: QuestionPerson;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface SentInboxItem {
  interactionId: string;
  status: InteractionStatus;
  nextActions: AnswererAction[];
  person: QuestionPerson;
  updatedAt: string;
  expiresAt?: string;
}

export interface QuestionInbox {
  received: ReceivedInboxItem[];
  sent: SentInboxItem[];
  counts: { received: number; sent: number };
}

export type ProfileQuestionSource = 'PRESET' | 'PRESET_EDITED' | 'CUSTOM';

export interface OwnProfileQuestion {
  id: string;
  presetId: string | null;
  source: ProfileQuestionSource;
  locale?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  correctOption: QuestionOption;
  displayOrder: number;
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | string;
  moderationReason: string | null;
  updatedAt?: string;
}

export interface OwnProfileQuestions {
  maxQuestions: number;
  questionsRequired: boolean;
  activeQuestionCount: number;
  questions: OwnProfileQuestion[];
}

export interface ProfileQuestionInput {
  questionText: string;
  optionA: string;
  optionB: string;
  correctOption: QuestionOption;
  presetId?: string | null;
}

export interface QuestionPreset {
  id: string;
  code: string;
  category: string;
  locale: string;
  questionText: string;
  optionA: string;
  optionB: string;
}

export const QUESTION_QUERY_KEYS = {
  // Versioned so a client upgraded from radius-based Discovery cannot reuse a persisted/stale
  // query result assembled under the old distance ceiling.
  feedV2: ['discovery', 'v2', 'feed', 'global-v1'] as const,
  inbox: ['questions', 'inbox'] as const,
  status: (userId: string) => ['questions', 'status', userId] as const,
  ownQuestions: ['questions', 'profile', 'me'] as const,
  presets: (locale: string) => ['questions', 'presets', locale] as const,
};

/** Every question state change can move a person between feed, inbox and profile/map status. */
export function invalidateQuestionState(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.inbox });
  void queryClient.invalidateQueries({ queryKey: ['questions', 'status'] });
}

export function newIdempotencyKey(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useDiscoveryV2FeedQuery(cursor: string | null, limit = 20, sessionKey = 0, enabled = true) {
  return useQuery({
    queryKey: [...QUESTION_QUERY_KEYS.feedV2, sessionKey, cursor, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return apiClient.get(`/api/discovery/v2/feed?${params.toString()}`).then((res) => ({
        profiles: Array.isArray(res?.data) ? res.data : [],
        paging: {
          limit: Number(res?.paging?.limit) || limit,
          hasMore: res?.paging?.hasMore === true,
          nextCursor: typeof res?.paging?.nextCursor === 'string' ? res.paging.nextCursor : null,
        },
      } as DiscoveryV2Page));
    },
    enabled,
    staleTime: 60 * 1000,
    // QUESTIONS_REQUIRED / MIN_PROFILE_PHOTOS are states, not transient failures.
    retry: (failureCount, error: any) =>
      !['QUESTIONS_REQUIRED', 'MIN_PROFILE_PHOTOS'].includes(error?.code) && failureCount < 2,
  });
}

export function useQuestionStatusQuery(userId?: string, enabled = true) {
  return useQuery({
    queryKey: QUESTION_QUERY_KEYS.status(userId || ''),
    queryFn: () => apiClient.get(`/api/questions/status/${userId}`) as Promise<QuestionStatus>,
    enabled: Boolean(userId) && enabled,
    staleTime: 15 * 1000,
  });
}

export function useQuestionInboxQuery() {
  return useQuery({
    queryKey: QUESTION_QUERY_KEYS.inbox,
    queryFn: () =>
      apiClient.get('/api/questions/inbox').then((res) => ({
        received: Array.isArray(res?.received) ? res.received : [],
        sent: Array.isArray(res?.sent) ? res.sent : [],
        counts: res?.counts || { received: 0, sent: 0 },
      } as QuestionInbox)),
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useStartQuestionAttemptMutation() {
  return useMutation({
    mutationFn: ({ targetUserId, idempotencyKey }: { targetUserId: string; idempotencyKey: string }) =>
      apiClient
        .post('/api/questions/attempts', { targetUserId, idempotencyKey })
        .then((res) => res?.attempt as QuestionPresentation),
  });
}

export function useAnswerQuestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, selectedOption }: { attemptId: string; selectedOption: QuestionOption }) =>
      apiClient
        .post(`/api/questions/attempts/${attemptId}/answer`, { selectedOption })
        .then((res) => ({
          result: res?.result,
          interactionId: res?.interactionId,
          interactionStatus: res?.interactionStatus,
          nextActions: Array.isArray(res?.nextActions) ? res.nextActions : [],
        } as AnswerResult)),
    onSuccess: () => invalidateQuestionState(queryClient),
  });
}

type InteractionAction = 'retry-request' | 'retry-approve' | 'retry-decline' | 'accept' | 'pass';

export function useInteractionActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, action }: { interactionId: string; action: InteractionAction }) =>
      apiClient.post(`/api/questions/interactions/${interactionId}/${action}`, {}) as Promise<{
        interactionId: string;
        interactionStatus: InteractionStatus;
        matchId?: string;
      }>,
    onSuccess: (data) => {
      invalidateQuestionState(queryClient);
      if (data?.matchId) void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useQuestionSuperlikeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, idempotencyKey }: { interactionId: string; idempotencyKey: string }) =>
      apiClient.post(`/api/questions/interactions/${interactionId}/superlike`, { idempotencyKey }) as Promise<{
        interactionId: string;
        interactionStatus: InteractionStatus;
        superlikeSource?: 'BALANCE' | 'SUBSCRIPTION_QUOTA';
        charged?: boolean;
        superlikeBalance?: number;
      }>,
    onSuccess: () => {
      invalidateQuestionState(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['user', 'entitlements'] });
      void queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
}

export function useDiscoveryPassMutation() {
  return useMutation({
    mutationFn: (targetUserId: string) => apiClient.post('/api/discovery/pass', { targetUserId }),
  });
}

export function useResetDiscoveryPassesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post('/api/discovery/reset-passes', {}).then((res) => ({ resetCount: Number(res?.resetCount) || 0 })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.feedV2 });
    },
  });
}

export function useOwnProfileQuestionsQuery(enabled = true) {
  return useQuery({
    queryKey: QUESTION_QUERY_KEYS.ownQuestions,
    queryFn: () =>
      apiClient.get('/api/profile-questions/me').then((res) => ({
        maxQuestions: Number(res?.maxQuestions) || 3,
        questionsRequired: res?.questionsRequired === true,
        activeQuestionCount: Number(res?.activeQuestionCount) || 0,
        questions: Array.isArray(res?.questions) ? res.questions : [],
      } as OwnProfileQuestions)),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useQuestionPresetsQuery(locale: string, enabled = true) {
  return useQuery({
    queryKey: QUESTION_QUERY_KEYS.presets(locale),
    queryFn: () =>
      apiClient
        .get(`/api/question-presets?locale=${encodeURIComponent(locale)}`, { skipAuth: true })
        .then((res) => (Array.isArray(res?.presets) ? res.presets : []) as QuestionPreset[]),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

function useOwnQuestionWrite<TVariables>(fn: (variables: TVariables) => Promise<any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (res && Array.isArray(res.questions)) {
        queryClient.setQueryData(QUESTION_QUERY_KEYS.ownQuestions, {
          maxQuestions: Number(res.maxQuestions) || 3,
          questionsRequired: res.questionsRequired === true,
          activeQuestionCount: Number(res.activeQuestionCount) || 0,
          questions: res.questions,
        } as OwnProfileQuestions);
      }
      void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.ownQuestions });
      void queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
      void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.feedV2 });
    },
  });
}

export function useCreateProfileQuestionMutation() {
  return useOwnQuestionWrite((input: ProfileQuestionInput) => apiClient.post('/api/profile-questions', input));
}

export function useUpdateProfileQuestionMutation() {
  return useOwnQuestionWrite(({ id, input }: { id: string; input: ProfileQuestionInput }) =>
    apiClient.put(`/api/profile-questions/${id}`, input)
  );
}

export function useDeleteProfileQuestionMutation() {
  return useOwnQuestionWrite((id: string) => apiClient.delete(`/api/profile-questions/${id}`));
}

export function useReorderProfileQuestionsMutation() {
  return useOwnQuestionWrite((questionIds: string[]) =>
    apiClient.put('/api/profile-questions/reorder', { questionIds })
  );
}

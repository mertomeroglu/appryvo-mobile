import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api/apiClient';

/**
 * Question-first social client (API: /api/questions/*, /api/profile-questions/*).
 * A question is answered, the owner sees the answer and decides whether to connect. There is no
 * right or wrong answer: the owner's own pick is never sent to anyone else, and the server only
 * reports whether the two picks were the same (`sameAnswer`).
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

export type AnswererAction = 'REQUEST_RETRY' | 'CLOSE' | 'ANSWER';
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

export interface QuestionPresentation {
  attemptId: string;
  interactionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  expiresAt?: string;
}

export interface AnswerResult {
  /** Every answer is delivered to the question owner. */
  outcome: 'DELIVERED';
  /** Whether the answer is the same as the owner's own pick. Neither is "right". */
  sameAnswer: boolean;
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
  // SUPERLIKE_PENDING only appears on items created before Super Like was retired; they are
  // resolved exactly like an ordinary answer.
  status: 'SUPERLIKE_PENDING' | 'OWNER_PENDING' | 'RETRY_REQUESTED';
  questionText?: string;
  answerOption?: QuestionOption | null;
  answerText?: string | null;
  sameAnswer?: boolean | null;
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

export interface QuestionFeedItem {
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  locale?: string;
  author: {
    id: string;
    name: string;
    city?: string;
    verified?: boolean;
    photoThumbnailUrl?: string;
  };
  sharedInterestCount: number;
  sharedInterests: string[];
  sharedCommunityCount: number;
  interactionId: string | null;
  interactionStatus: InteractionStatus | null;
  canAnswer: boolean;
}

export interface QuestionFeedPage {
  items: QuestionFeedItem[];
  questionsRequired: boolean;
  nextCursor: string | null;
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
  questionFeed: ['questions', 'feed', 'v1'] as const,
  inbox: ['questions', 'inbox'] as const,
  status: (userId: string) => ['questions', 'status', userId] as const,
  ownQuestions: ['questions', 'profile', 'me'] as const,
  presets: (locale: string) => ['questions', 'presets', locale] as const,
};

/** Every question state change can move a person between feed, inbox and profile/map status. */
export function invalidateQuestionState(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.inbox });
  void queryClient.invalidateQueries({ queryKey: ['questions', 'status'] });
  void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.questionFeed });
}

export function newIdempotencyKey(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Home feed: one active question per person, newest first. No people filters, no ranking. */
export function useQuestionFeedQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: QUESTION_QUERY_KEYS.questionFeed,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      const qs = params.toString();
      return apiClient.get(`/api/questions/feed${qs ? `?${qs}` : ''}`).then((res) => ({
        items: Array.isArray(res?.items) ? res.items : [],
        questionsRequired: res?.questionsRequired === true,
        nextCursor: typeof res?.nextCursor === 'string' ? res.nextCursor : null,
      } as QuestionFeedPage));
    },
    getNextPageParam: (last: QuestionFeedPage) => last.nextCursor,
    enabled,
    staleTime: 60 * 1000,
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
    mutationFn: ({ targetUserId, questionId, idempotencyKey }: { targetUserId: string; questionId?: string | null; idempotencyKey: string }) =>
      apiClient
        .post('/api/questions/attempts', questionId ? { targetUserId, questionId, idempotencyKey } : { targetUserId, idempotencyKey })
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
          outcome: 'DELIVERED',
          sameAnswer: res?.sameAnswer === true,
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
      void queryClient.invalidateQueries({ queryKey: QUESTION_QUERY_KEYS.questionFeed });
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

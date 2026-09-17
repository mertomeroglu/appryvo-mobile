import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Crown, Inbox, Send, Sparkles } from 'lucide-react';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { IconButton } from '../../components/ui/IconButton';
import { FilterChip } from '../../components/ui/Chip';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { MatchModal } from '../../components/MatchModal';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { ApiException } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';
import { useAppTranslation } from '../../i18n/appLocale';
import { SPRING } from '../../motion/tokens';
import {
  useInteractionActionMutation,
  useQuestionInboxQuery,
  type InteractionStatus,
  type OwnerAction,
  type QuestionPerson,
  type ReceivedInboxItem,
  type SentInboxItem,
} from '../../hooks/useQuestionQueries';
import { QuestionAnswerSheet, type QuestionAnswerTarget } from './QuestionAnswerSheet';
import { questionErrorKey, useQuestionText, type QuestionTextKey } from './questionLocale';

type InboxTab = 'received' | 'sent';

function personPhoto(person: QuestionPerson): string | undefined {
  const url = person.photoThumbnailUrl || person.photoMediumUrl || person.photoUrl;
  return url ? normalizeMediaUrl(url) : undefined;
}

function personSubtitle(person: QuestionPerson): string {
  return [person.age ? String(person.age) : null, person.city || null].filter(Boolean).join(' · ');
}

const SENT_STATUS_KEYS: Partial<Record<InteractionStatus, QuestionTextKey>> = {
  QUESTION_PRESENTED: 'statusAwaiting',
  ANSWER_WRONG: 'statusWrong',
  OWNER_PENDING: 'statusAwaiting',
  RETRY_REQUESTED: 'statusRetryRequested',
  RETRY_APPROVED: 'statusRetryApproved',
  RETRY_DECLINED: 'statusClosed',
  SUPERLIKE_PENDING: 'statusSuperlikeSent',
  MATCHED: 'statusMatched',
  CLOSED: 'statusClosed',
  EXPIRED: 'statusClosed',
  CANCELLED: 'statusClosed',
};

/** Replaces "Seni Begenenler": every pending decision that belongs to the question flow. */
export const QuestionInboxScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { qt } = useQuestionText();
  const [tab, setTab] = useState<InboxTab>('received');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answerTarget, setAnswerTarget] = useState<{ target: QuestionAnswerTarget; status: InteractionStatus } | null>(null);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; person?: QuestionPerson; matchId?: string }>({ isOpen: false });

  const inbox = useQuestionInboxQuery();
  const action = useInteractionActionMutation();

  const received = useMemo(() => inbox.data?.received || [], [inbox.data]);
  const sent = useMemo(() => inbox.data?.sent || [], [inbox.data]);

  const runAction = async (item: ReceivedInboxItem, ownerAction: OwnerAction) => {
    setBusyId(item.interactionId);
    const endpoint = ownerAction === 'ACCEPT'
      ? 'accept'
      : ownerAction === 'PASS'
        ? 'pass'
        : ownerAction === 'RETRY_APPROVE'
          ? 'retry-approve'
          : 'retry-decline';
    try {
      const result = await action.mutateAsync({ interactionId: item.interactionId, action: endpoint });
      if (ownerAction === 'ACCEPT' && result?.matchId) {
        setMatchResult({ isOpen: true, person: item.person, matchId: result.matchId });
      } else if (ownerAction === 'RETRY_APPROVE') {
        toast.success(qt('retryApprovedToast'));
      }
    } catch (err) {
      toast.error(qt(questionErrorKey(err instanceof ApiException ? err.code : null)));
    } finally {
      setBusyId(null);
    }
  };

  const receivedMessage = (item: ReceivedInboxItem) => {
    const name = item.person.name;
    if (item.status === 'SUPERLIKE_PENDING') return qt('cardSuperlikeTemplate', { name });
    if (item.status === 'RETRY_REQUESTED') return qt('cardRetryTemplate', { name });
    return qt('cardCorrectTemplate', { name });
  };

  const actionLabel = (ownerAction: OwnerAction, status: ReceivedInboxItem['status']): string => {
    if (ownerAction === 'ACCEPT') return qt('match');
    if (ownerAction === 'PASS') return qt('pass');
    if (ownerAction === 'RETRY_APPROVE') return status === 'RETRY_REQUESTED' ? qt('accept') : qt('giveAnotherChance');
    return qt('decline');
  };

  const body = () => {
    if (inbox.isLoading) {
      return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} variant="card" className="h-32" />)}</div>;
    }
    if (inbox.isError) {
      return <ErrorState title={qt('inboxError')} onRetry={() => void inbox.refetch()} />;
    }
    if (tab === 'received') {
      if (received.length === 0) {
        return <EmptyState icon={<Inbox className="h-8 w-8" aria-hidden="true" />} title={qt('emptyReceivedTitle')} subtitle={qt('emptyReceivedDescription')} />;
      }
      return (
        <motion.ul layout className="space-y-3">
          <AnimatePresence initial={false}>
            {received.map((item) => (
              <motion.li
                key={item.interactionId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING.soft}
                className="rounded-3xl border border-app bg-surface p-4"
                data-testid="question-inbox-received"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={personPhoto(item.person)} name={item.person.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-bold text-app">{item.person.name}</p>
                    <p className="truncate text-caption text-app-muted">{personSubtitle(item.person)}</p>
                  </div>
                  {item.viaSuperlike && <Sparkles className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden="true" />}
                  {item.priority && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-1 text-[11px] font-bold text-white">
                      <Crown className="h-3 w-3" aria-hidden="true" />
                      {qt('goldPriority')}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-body normal-case leading-relaxed text-app">{receivedMessage(item)}</p>
                {item.questionText && (
                  <p className="mt-2 rounded-2xl bg-surface-elevated p-3 text-caption normal-case text-app-muted">
                    {qt('questionLabel')}: {item.questionText}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.actions.map((ownerAction) => (
                    <AppButton
                      key={ownerAction}
                      size="sm"
                      variant={ownerAction === 'ACCEPT' ? 'primary' : ownerAction === 'RETRY_APPROVE' ? 'secondary' : 'ghost'}
                      loading={busyId === item.interactionId && action.isPending}
                      disabled={busyId !== null}
                      onClick={() => void runAction(item, ownerAction)}
                    >
                      {actionLabel(ownerAction, item.status)}
                    </AppButton>
                  ))}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      );
    }

    if (sent.length === 0) {
      return <EmptyState icon={<Send className="h-8 w-8" aria-hidden="true" />} title={qt('emptySentTitle')} subtitle={qt('emptySentDescription')} />;
    }
    return (
      <ul className="space-y-3">
        {sent.map((item: SentInboxItem) => {
          const statusKey = SENT_STATUS_KEYS[item.status] || 'statusAwaiting';
          const canAnswer = item.nextActions.includes('ANSWER');
          const canRetry = item.nextActions.includes('REQUEST_RETRY');
          const canSuperlike = item.nextActions.includes('SUPERLIKE');
          return (
            <li key={item.interactionId} className="rounded-3xl border border-app bg-surface p-4" data-testid="question-inbox-sent">
              <div className="flex items-center gap-3">
                <Avatar src={personPhoto(item.person)} name={item.person.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-app">{item.person.name}</p>
                  <p className="truncate text-caption text-app-muted">{qt(statusKey)}</p>
                </div>
              </div>
              {(canAnswer || canRetry || canSuperlike || item.status === 'MATCHED') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canAnswer && (
                    <AppButton
                      size="sm"
                      variant="primary"
                      onClick={() => setAnswerTarget({ target: { id: item.person.id, name: item.person.name }, status: item.status })}
                    >
                      {qt('answerNewQuestion')}
                    </AppButton>
                  )}
                  {!canAnswer && (canRetry || canSuperlike) && (
                    <AppButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setAnswerTarget({ target: { id: item.person.id, name: item.person.name }, status: item.status })}
                    >
                      {canRetry ? qt('requestRetry') : qt('superlikeShow')}
                    </AppButton>
                  )}
                  {item.status === 'MATCHED' && (
                    <AppButton size="sm" variant="secondary" onClick={() => navigate('/messages')}>
                      {qt('sendMessage')}
                    </AppButton>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-full flex-col bg-app text-app">
      <ScreenHeader
        title={qt('inboxTitle')}
        leading={
          <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
      />
      <div className="flex gap-2 px-4 pt-3">
        <FilterChip selected={tab === 'received'} onClick={() => setTab('received')}>
          {qt('tabReceived')}{received.length > 0 ? ` (${received.length})` : ''}
        </FilterChip>
        <FilterChip selected={tab === 'sent'} onClick={() => setTab('sent')}>
          {qt('tabSent')}
        </FilterChip>
      </div>
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-4">{body()}</main>

      <QuestionAnswerSheet
        isOpen={answerTarget !== null}
        onClose={() => setAnswerTarget(null)}
        target={answerTarget?.target || null}
        initialStatus={answerTarget?.status || null}
        onQuestionsRequired={() => navigate('/profile/questions')}
      />

      <MatchModal
        isOpen={matchResult.isOpen}
        onClose={() => setMatchResult({ isOpen: false })}
        matchedUser={matchResult.person ? { name: matchResult.person.name, photoUrl: personPhoto(matchResult.person) } : null}
        matchId={matchResult.matchId}
      />
    </div>
  );
};

export default QuestionInboxScreen;

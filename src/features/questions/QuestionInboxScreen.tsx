import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Inbox, Send } from 'lucide-react';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { IconButton } from '../../components/ui/IconButton';
import { FilterChip } from '../../components/ui/Chip';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { ApiException } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';
import { useAppTranslation } from '../../i18n/appLocale';
import { SPRING } from '../../motion/tokens';
import { cn } from '../../lib/utils';
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
import { SyntheticContentBadge } from '../../components/SyntheticContentBadge';
import { ConnectionMadeSheet } from '../social/ConnectionMadeSheet';

type InboxTab = 'received' | 'sent';

function personPhoto(person: QuestionPerson): string | undefined {
  const url = person.photoThumbnailUrl || person.photoMediumUrl || person.photoUrl;
  return url ? normalizeMediaUrl(url) : undefined;
}

// Legacy states (ANSWER_WRONG, SUPERLIKE_PENDING) are shown with the same neutral labels as
// current ones: nothing on this screen calls an answer right or wrong.
const SENT_STATUS_KEYS: Partial<Record<InteractionStatus, QuestionTextKey>> = {
  QUESTION_PRESENTED: 'statusAwaiting',
  ANSWER_WRONG: 'statusAnswered',
  OWNER_PENDING: 'statusAwaiting',
  RETRY_REQUESTED: 'statusRetryRequested',
  RETRY_APPROVED: 'statusRetryApproved',
  RETRY_DECLINED: 'statusClosed',
  SUPERLIKE_PENDING: 'statusAwaiting',
  MATCHED: 'statusConnected',
  CLOSED: 'statusClosed',
  EXPIRED: 'statusClosed',
  CANCELLED: 'statusClosed',
};

/**
 * Answers to my questions (I decide whether to connect) and the answers I sent. Accepting an
 * answer creates a mutual connection; only then can the two people message each other.
 */
export const QuestionInboxScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { qt } = useQuestionText();
  const [tab, setTab] = useState<InboxTab>('received');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answerTarget, setAnswerTarget] = useState<{ target: QuestionAnswerTarget; status: InteractionStatus } | null>(null);
  const [connection, setConnection] = useState<{ person: QuestionPerson; conversationId: string } | null>(null);

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
        setConnection({ person: item.person, conversationId: result.matchId });
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
    if (item.status === 'RETRY_REQUESTED') return qt('cardRetryTemplate', { name });
    return qt('cardAnswerTemplate', { name });
  };

  const actionLabel = (ownerAction: OwnerAction, status: ReceivedInboxItem['status']): string => {
    if (ownerAction === 'ACCEPT') return qt('connect');
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
                    <p className="flex items-center gap-1.5 truncate text-body font-bold text-app">
                      <span className="truncate">{item.person.name}</span>
                      {item.person.isDemo && <SyntheticContentBadge />}
                      {item.person.isOfficialSystem && <SyntheticContentBadge kind="official" />}
                    </p>
                    {item.person.city && <p className="truncate text-caption text-app-muted">{item.person.city}</p>}
                  </div>
                  {typeof item.sameAnswer === 'boolean' && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                        item.sameAnswer ? 'bg-brand-primary/15 text-brand-primary' : 'bg-surface-elevated text-app-muted'
                      )}
                      data-testid="question-inbox-same-answer"
                    >
                      {qt(item.sameAnswer ? 'sameAnswerBadge' : 'differentAnswerBadge')}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-body normal-case leading-relaxed text-app">{receivedMessage(item)}</p>
                {item.questionText && (
                  <div className="mt-2 space-y-1 rounded-2xl bg-surface-elevated p-3 text-caption normal-case">
                    <p className="text-app-muted">{qt('questionLabel')}: {item.questionText}</p>
                    {item.answerText && (
                      <p className="font-semibold text-app">{qt('theirAnswerLabel')}: {item.answerText}</p>
                    )}
                  </div>
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
          return (
            <li key={item.interactionId} className="rounded-3xl border border-app bg-surface p-4" data-testid="question-inbox-sent">
              <div className="flex items-center gap-3">
                <Avatar src={personPhoto(item.person)} name={item.person.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-body font-bold text-app">
                    <span className="truncate">{item.person.name}</span>
                    {item.person.isDemo && <SyntheticContentBadge />}
                    {item.person.isOfficialSystem && <SyntheticContentBadge kind="official" />}
                  </p>
                  <p className="truncate text-caption text-app-muted">{qt(statusKey)}</p>
                </div>
              </div>
              {(canAnswer || canRetry || item.status === 'MATCHED') && (
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
                  {!canAnswer && canRetry && (
                    <AppButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setAnswerTarget({ target: { id: item.person.id, name: item.person.name }, status: item.status })}
                    >
                      {qt('requestRetry')}
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

      <ConnectionMadeSheet
        isOpen={connection !== null}
        onClose={() => setConnection(null)}
        person={connection ? { name: connection.person.name, photoUrl: personPhoto(connection.person) } : null}
        conversationId={connection?.conversationId}
      />
    </div>
  );
};

export default QuestionInboxScreen;

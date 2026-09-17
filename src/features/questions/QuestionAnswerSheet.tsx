import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { NotificationType } from '@capacitor/haptics';
import { CheckCircle2, Clock3, HelpCircle, Loader2, RotateCcw, Sparkles, Star, XCircle } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AppButton } from '../../components/ui/AppButton';
import { RewardedAdSheet } from '../../components/RewardedAdSheet';
import { apiClient, ApiException } from '../../services/api/apiClient';
import { nativeHaptics } from '../../native/haptics';
import { useAppTranslation } from '../../i18n/appLocale';
import { DURATION, PRESS_SCALE, SPRING } from '../../motion/tokens';
import { cn } from '../../lib/utils';
import {
  newIdempotencyKey,
  useAnswerQuestionMutation,
  useInteractionActionMutation,
  useQuestionSuperlikeMutation,
  useStartQuestionAttemptMutation,
  type AnswererAction,
  type InteractionStatus,
  type QuestionOption,
  type QuestionPresentation,
  type QuestionStatus,
} from '../../hooks/useQuestionQueries';
import { questionErrorKey, useQuestionText } from './questionLocale';

export interface QuestionAnswerTarget {
  id: string;
  name: string;
}

export type QuestionSheetOutcome = 'CORRECT' | 'WRONG' | 'RETRY_REQUESTED' | 'SUPERLIKE_SENT' | 'UNAVAILABLE';

interface QuestionAnswerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  target: QuestionAnswerTarget | null;
  /** Known interaction state (e.g. from the feed/inbox) so a wrong answer resumes on its options. */
  initialStatus?: InteractionStatus | null;
  onOutcome?: (outcome: QuestionSheetOutcome, targetId: string) => void;
  onQuestionsRequired?: () => void;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'question'; attempt: QuestionPresentation }
  | { kind: 'correct' }
  | { kind: 'wrong'; interactionId: string; actions: AnswererAction[] }
  | { kind: 'retryRequested' }
  | { kind: 'superlikeSent' }
  | { kind: 'quota'; interactionId: string; actions: AnswererAction[] }
  | { kind: 'limit'; resetsInSeconds: number | null }
  | { kind: 'error'; code: string | null };

function errorCode(error: unknown): string | null {
  return error instanceof ApiException ? error.code || null : null;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof ApiException && error.rawDetails && typeof error.rawDetails === 'object') {
    return error.rawDetails as Record<string, unknown>;
  }
  return {};
}

export const QuestionAnswerSheet: React.FC<QuestionAnswerSheetProps> = ({
  isOpen,
  onClose,
  target,
  initialStatus = null,
  onOutcome,
  onQuestionsRequired,
}) => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { qt } = useQuestionText();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [selected, setSelected] = useState<QuestionOption | null>(null);
  const [rewardedOpen, setRewardedOpen] = useState(false);
  const attemptKeyRef = useRef<string>('');
  const superlikeKeyRef = useRef<string>('');
  const openedForRef = useRef<string | null>(null);

  const startAttempt = useStartQuestionAttemptMutation();
  const answer = useAnswerQuestionMutation();
  const interactionAction = useInteractionActionMutation();
  const superlike = useQuestionSuperlikeMutation();

  const loadWrongState = useCallback(async (targetId: string, fallbackInteractionId: string | null) => {
    try {
      const status = (await apiClient.get(`/api/questions/status/${encodeURIComponent(targetId)}`)) as QuestionStatus;
      if (status.interactionStatus === 'ANSWER_WRONG' && status.interactionId) {
        setPhase({ kind: 'wrong', interactionId: status.interactionId, actions: status.nextActions || ['CLOSE'] });
        return;
      }
      setPhase({ kind: 'error', code: status.interactionStatus ? 'INTERACTION_IN_PROGRESS' : null });
    } catch (error) {
      if (fallbackInteractionId) {
        setPhase({ kind: 'wrong', interactionId: fallbackInteractionId, actions: ['CLOSE'] });
      } else {
        setPhase({ kind: 'error', code: errorCode(error) });
      }
    }
  }, []);

  const begin = useCallback(async (targetId: string) => {
    setSelected(null);
    setPhase({ kind: 'loading' });
    if (!attemptKeyRef.current) attemptKeyRef.current = newIdempotencyKey();
    try {
      const attempt = await startAttempt.mutateAsync({ targetUserId: targetId, idempotencyKey: attemptKeyRef.current });
      setPhase({ kind: 'question', attempt });
    } catch (error) {
      const code = errorCode(error);
      const details = errorDetails(error);
      if (code === 'QUESTION_DAILY_LIMIT') {
        const seconds = Number(details.resetsInSeconds);
        setPhase({ kind: 'limit', resetsInSeconds: Number.isFinite(seconds) ? seconds : null });
        return;
      }
      if (code === 'INTERACTION_IN_PROGRESS' && details.interactionStatus === 'ANSWER_WRONG') {
        await loadWrongState(targetId, typeof details.interactionId === 'string' ? details.interactionId : null);
        return;
      }
      if (code === 'QUESTIONS_REQUIRED' && onQuestionsRequired) {
        onClose();
        onQuestionsRequired();
        return;
      }
      if (code === 'TARGET_UNAVAILABLE' || code === 'INTERACTION_CLOSED' || code === 'NO_QUESTION_AVAILABLE') {
        onOutcome?.('UNAVAILABLE', targetId);
      }
      setPhase({ kind: 'error', code });
    }
  }, [loadWrongState, onClose, onOutcome, onQuestionsRequired, startAttempt]);

  useEffect(() => {
    if (!isOpen || !target) {
      openedForRef.current = null;
      return;
    }
    if (openedForRef.current === target.id) return;
    openedForRef.current = target.id;
    attemptKeyRef.current = '';
    superlikeKeyRef.current = '';
    if (initialStatus === 'ANSWER_WRONG') {
      setPhase({ kind: 'loading' });
      void loadWrongState(target.id, null);
    } else {
      void begin(target.id);
    }
    // begin/loadWrongState are stable enough per open; re-running on their identity would restart attempts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, target?.id]);

  const submitAnswer = async (option: QuestionOption) => {
    if (phase.kind !== 'question' || selected || answer.isPending || !target) return;
    setSelected(option);
    void nativeHaptics.impact();
    try {
      const result = await answer.mutateAsync({ attemptId: phase.attempt.attemptId, selectedOption: option });
      if (result.result === 'CORRECT') {
        void nativeHaptics.notification(NotificationType.Success);
        setPhase({ kind: 'correct' });
        onOutcome?.('CORRECT', target.id);
      } else {
        void nativeHaptics.notification(NotificationType.Warning);
        setPhase({ kind: 'wrong', interactionId: result.interactionId, actions: result.nextActions || ['CLOSE'] });
        onOutcome?.('WRONG', target.id);
      }
    } catch (error) {
      setSelected(null);
      setPhase({ kind: 'error', code: errorCode(error) });
    }
  };

  const requestRetry = async (interactionId: string) => {
    if (!target) return;
    try {
      await interactionAction.mutateAsync({ interactionId, action: 'retry-request' });
      setPhase({ kind: 'retryRequested' });
      onOutcome?.('RETRY_REQUESTED', target.id);
    } catch (error) {
      setPhase({ kind: 'error', code: errorCode(error) });
    }
  };

  const sendSuperlike = async (interactionId: string, actions: AnswererAction[]) => {
    if (!target) return;
    if (!superlikeKeyRef.current) superlikeKeyRef.current = newIdempotencyKey();
    try {
      await superlike.mutateAsync({ interactionId, idempotencyKey: superlikeKeyRef.current });
      void nativeHaptics.notification(NotificationType.Success);
      setPhase({ kind: 'superlikeSent' });
      onOutcome?.('SUPERLIKE_SENT', target.id);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'SUPERLIKE_QUOTA_EXHAUSTED' || code === 'SUPERLIKE_NOT_AVAILABLE') {
        // Nothing was charged; a fresh key lets the next try (after an ad or purchase) go through.
        superlikeKeyRef.current = '';
        setPhase({ kind: 'quota', interactionId, actions });
        return;
      }
      setPhase({ kind: 'error', code });
    }
  };

  const busy = interactionAction.isPending || superlike.isPending;
  const title = target ? qt('sheetTitleTemplate', { name: target.name }) : '';

  const limitReset = phase.kind === 'limit' && phase.resetsInSeconds !== null
    ? qt('dailyLimitResetTemplate', {
        hours: Math.floor(phase.resetsInSeconds / 3600),
        minutes: Math.max(0, Math.ceil((phase.resetsInSeconds % 3600) / 60)),
      })
    : null;

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        <div className="px-6 pb-6 pt-2" data-testid="question-answer-sheet">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase.kind}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DURATION.micro }}
            >
              {phase.kind === 'loading' && (
                <div className="flex flex-col items-center py-10 text-app-muted">
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                  <p className="mt-3 text-caption">{qt('loadingQuestion')}</p>
                </div>
              )}

              {phase.kind === 'question' && (
                <div>
                  <div className="flex items-center gap-2 text-caption font-semibold text-app-muted">
                    <HelpCircle className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="truncate">{title}</span>
                  </div>
                  <h2 className="mt-3 text-title text-app leading-snug break-words">{phase.attempt.questionText}</h2>
                  <p className="mt-2 text-caption text-app-muted normal-case">{qt('sheetHint')}</p>
                  <div className="mt-5 space-y-3">
                    {(['A', 'B'] as const).map((option) => {
                      const label = option === 'A' ? phase.attempt.optionA : phase.attempt.optionB;
                      const isSelected = selected === option;
                      const locked = selected !== null;
                      return (
                        <motion.button
                          key={option}
                          type="button"
                          disabled={locked}
                          whileTap={locked ? undefined : { scale: PRESS_SCALE }}
                          transition={SPRING.snappy}
                          onClick={() => void submitAnswer(option)}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors',
                            isSelected ? 'border-brand-primary bg-brand-primary/10' : 'border-app bg-surface-elevated',
                            locked && !isSelected && 'opacity-50'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption font-bold',
                              isSelected ? 'bg-brand-gradient text-white' : 'bg-app-secondary text-app'
                            )}
                          >
                            {option}
                          </span>
                          <span className="flex-1 text-body font-semibold text-app break-words">{label}</span>
                          {isSelected && answer.isPending && <Loader2 className="h-4 w-4 animate-spin text-app-muted" aria-hidden="true" />}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {phase.kind === 'correct' && (
                <ResultBlock
                  icon={<CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
                  tone="success"
                  title={qt('correctTitle')}
                  description={qt('correctDescription')}
                >
                  <AppButton fullWidth size="lg" variant="primary" onClick={onClose}>{qt('close')}</AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'wrong' && (
                <ResultBlock
                  icon={<XCircle className="h-7 w-7" aria-hidden="true" />}
                  tone="danger"
                  title={qt('wrongTitle')}
                  description={phase.actions.some((a) => a === 'REQUEST_RETRY' || a === 'SUPERLIKE') ? qt('wrongDescription') : undefined}
                >
                  {phase.actions.includes('REQUEST_RETRY') && (
                    <AppButton
                      fullWidth
                      size="lg"
                      variant="secondary"
                      leftIcon={<RotateCcw className="h-4 w-4" />}
                      loading={interactionAction.isPending}
                      disabled={busy}
                      onClick={() => void requestRetry(phase.interactionId)}
                    >
                      {qt('requestRetry')}
                    </AppButton>
                  )}
                  {phase.actions.includes('SUPERLIKE') && (
                    <AppButton
                      fullWidth
                      size="lg"
                      variant="primary"
                      leftIcon={<Star className="h-4 w-4" />}
                      loading={superlike.isPending}
                      disabled={busy}
                      onClick={() => void sendSuperlike(phase.interactionId, phase.actions)}
                    >
                      {qt('superlikeShow')}
                    </AppButton>
                  )}
                  <AppButton fullWidth size="md" variant="ghost" disabled={busy} onClick={onClose}>{qt('close')}</AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'retryRequested' && (
                <ResultBlock
                  icon={<Clock3 className="h-7 w-7" aria-hidden="true" />}
                  tone="brand"
                  title={qt('retryRequestedTitle')}
                  description={qt('retryRequestedDescription')}
                >
                  <AppButton fullWidth size="lg" variant="primary" onClick={onClose}>{qt('close')}</AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'superlikeSent' && (
                <ResultBlock
                  icon={<Sparkles className="h-7 w-7" aria-hidden="true" />}
                  tone="brand"
                  title={qt('superlikeSentTitle')}
                  description={qt('superlikeSentDescription')}
                >
                  <AppButton fullWidth size="lg" variant="primary" onClick={onClose}>{qt('close')}</AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'quota' && (
                <ResultBlock
                  icon={<Star className="h-7 w-7" aria-hidden="true" />}
                  tone="brand"
                  title={qt('superlikeQuotaTitle')}
                  description={qt('superlikeQuotaDescription')}
                >
                  <AppButton fullWidth size="lg" variant="primary" onClick={() => setRewardedOpen(true)}>
                    {qt('watchAdForSuperlike')}
                  </AppButton>
                  <AppButton
                    fullWidth
                    size="md"
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      navigate('/premium');
                    }}
                  >
                    {t('explorePlusGoldCta')}
                  </AppButton>
                  <AppButton
                    fullWidth
                    size="md"
                    variant="ghost"
                    onClick={() => setPhase({ kind: 'wrong', interactionId: phase.interactionId, actions: phase.actions })}
                  >
                    {t('notNowLabel')}
                  </AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'limit' && (
                <ResultBlock
                  icon={<Clock3 className="h-7 w-7" aria-hidden="true" />}
                  tone="brand"
                  title={qt('dailyLimitTitle')}
                  description={qt('dailyLimitDescription')}
                  footnote={limitReset}
                >
                  <AppButton
                    fullWidth
                    size="lg"
                    variant="primary"
                    onClick={() => {
                      onClose();
                      navigate('/premium');
                    }}
                  >
                    {t('explorePlusGoldCta')}
                  </AppButton>
                  <AppButton fullWidth size="md" variant="ghost" onClick={onClose}>{t('notNowLabel')}</AppButton>
                </ResultBlock>
              )}

              {phase.kind === 'error' && (
                <ResultBlock
                  icon={<XCircle className="h-7 w-7" aria-hidden="true" />}
                  tone="danger"
                  title={qt(questionErrorKey(phase.code))}
                >
                  {phase.code === 'ATTEMPT_EXPIRED' && target && (
                    <AppButton fullWidth size="lg" variant="primary" onClick={() => { attemptKeyRef.current = ''; void begin(target.id); }}>
                      {qt('answerQuestion')}
                    </AppButton>
                  )}
                  <AppButton fullWidth size="md" variant="ghost" onClick={onClose}>{qt('close')}</AppButton>
                </ResultBlock>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </BottomSheet>

      <RewardedAdSheet
        isOpen={rewardedOpen}
        onClose={() => setRewardedOpen(false)}
        rewardType="REWARDED_SUPERLIKE"
        title={qt('superlikeQuotaTitle')}
        description={qt('superlikeQuotaDescription')}
        rewardLabel={qt('superlikeRewardLabel')}
      />
    </>
  );
};

const TONE_CLASSES = {
  success: 'bg-[#32D583]/15 text-[#32D583]',
  danger: 'bg-[#FF4B55]/15 text-[#FF4B55]',
  brand: 'bg-brand-gradient text-white',
} as const;

const ResultBlock: React.FC<{
  icon: React.ReactNode;
  tone: keyof typeof TONE_CLASSES;
  title: string;
  description?: string;
  footnote?: string | null;
  children?: React.ReactNode;
}> = ({ icon, tone, title, description, footnote, children }) => (
  <div className="flex flex-col items-center text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.snappy}
      className={cn('flex h-14 w-14 items-center justify-center rounded-full', TONE_CLASSES[tone])}
    >
      {icon}
    </motion.div>
    <h2 className="mt-4 text-title text-app">{title}</h2>
    {description && <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">{description}</p>}
    {footnote && <p className="mt-2 text-caption font-semibold text-app">{footnote}</p>}
    <div className="mt-6 w-full space-y-2.5">{children}</div>
  </div>
);

import React, { useState } from 'react';
import { Star, ShieldCheck } from 'lucide-react';
import { Modal } from './ui/Modal';
import { AppButton } from './ui/AppButton';
import {
  useMeetingStatusQuery,
  useConfirmMeetingMutation,
  useSubmitMeetingFeedbackMutation,
} from '../hooks/useQueries';
import { toast } from '../stores/useToastStore';
import { useAppTranslation } from '../i18n/appLocale';
import { TRUST_CATEGORY_KEYS, getTrustCategoryLabel, type TrustCategoryKey } from '../lib/trustLabels';

interface MeetingFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId?: string | null;
}

const DEFAULT_SCORES: Record<TrustCategoryKey, number> = {
  communication: 0, profileMatch: 0, reliability: 0, comfort: 0, intent: 0, listening: 0, respect: 0,
};

export const MeetingFeedbackModal: React.FC<MeetingFeedbackModalProps> = ({ isOpen, onClose, matchId }) => {
  const { t, locale } = useAppTranslation();
  const { data: status, isLoading } = useMeetingStatusQuery(isOpen ? matchId : null);
  const confirmMutation = useConfirmMeetingMutation();
  const feedbackMutation = useSubmitMeetingFeedbackMutation();
  const [scores, setScores] = useState<Record<TrustCategoryKey, number>>(DEFAULT_SCORES);
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = () => {
    if (!matchId) return;
    confirmMutation.mutate(matchId, {
      onSuccess: () => toast.success(t('meetingConfirmToast')),
      onError: (err: any) => toast.error(err?.message || t('meetingConfirmFailedError')),
    });
  };

  const handleSubmitFeedback = () => {
    if (!status?.meetingId) return;
    if (TRUST_CATEGORY_KEYS.some((key) => scores[key] < 1)) return;
    feedbackMutation.mutate(
      { meetingId: status.meetingId, scores },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast.success(t('feedbackSubmittedToast'));
        },
        onError: (err: any) => {
          const code = err?.code || err?.data?.code;
          toast.error(code === 'FEEDBACK_ALREADY_SUBMITTED' ? t('feedbackAlreadySubmittedError') : (err?.message || t('feedbackSubmitFailedError')));
        },
      }
    );
  };

  const allScored = TRUST_CATEGORY_KEYS.every((key) => scores[key] >= 1);
  const feedbackDone = submitted || status?.feedbackSubmitted;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md w-full">
      <div className="p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-heading font-black text-app">
          <ShieldCheck className="w-5 h-5 text-[#32D583]" />
          {t('feedbackFormTitle')}
        </h3>

        {isLoading ? (
          <div className="h-24 rounded-2xl bg-app-secondary animate-pulse" />
        ) : status?.status === 'CONFIRMED' && feedbackDone ? (
          <p className="text-body text-app-muted">{t('feedbackSubmittedToast')}</p>
        ) : status?.status === 'CONFIRMED' ? (
          <div className="space-y-4">
            <p className="text-caption font-bold text-app">{t('meetingConfirmedBothTitle')}</p>
            <div className="space-y-3">
              {TRUST_CATEGORY_KEYS.map((key) => (
                <div key={key} className="space-y-1.5">
                  <span className="text-caption font-medium text-app">{getTrustCategoryLabel(key, locale)}</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${getTrustCategoryLabel(key, locale)} ${n}/5`}
                        onClick={() => setScores((prev) => ({ ...prev, [key]: n }))}
                        className="p-1 -m-1"
                      >
                        <Star
                          className={`w-6 h-6 ${scores[key] >= n ? 'text-[#F5B942] fill-current' : 'text-app-muted'}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              disabled={!allScored}
              loading={feedbackMutation.isPending}
              onClick={handleSubmitFeedback}
            >
              {t('feedbackSubmitButton')}
            </AppButton>
          </div>
        ) : status?.selfConfirmed ? (
          <p className="text-body text-app-muted">{t('meetingConfirmedSelfWaiting')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-body text-app-muted">{t('meetingConfirmPrompt')}</p>
            <AppButton variant="primary" size="lg" fullWidth loading={confirmMutation.isPending} onClick={handleConfirm}>
              {t('meetingConfirmPrompt')}
            </AppButton>
          </div>
        )}
      </div>
    </Modal>
  );
};

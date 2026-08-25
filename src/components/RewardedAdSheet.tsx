import React, { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { useInitRewardSessionMutation, useVerifyRewardSessionMutation } from '../hooks/useQueries';
import { useAuthStore } from '../stores/useAuthStore';
import { nativeAdMob } from '../native/admob';
import { toast } from '../stores/useToastStore';
import { BottomSheet } from './ui/BottomSheet';
import { AppButton } from './ui/AppButton';
import { useAppTranslation } from '../i18n/appLocale';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RewardedAdSheetProps {
  isOpen: boolean;
  onClose: () => void;
  rewardType?: 'REWARDED_LIKE' | 'REWARDED_SUPERLIKE' | 'REWARDED_REWIND';
  title: string;
  description: string;
  rewardLabel: string;
}

/**
 * Rewarded-ad flow for any of the three ad-fundable credits. The actual credit is never granted
 * from the client's own "ad watched" signal -- it only exists once POST /reward-session/verify
 * reports `granted: true`, which itself only happens after Google's independent SSV callback has
 * flipped the session server-side (see ads_controller.js / admob_controller.js). If the SSV
 * callback hasn't landed yet by the time this stops polling, the reward still applies the next
 * time entitlements are checked -- nothing here can silently lose it.
 */
export const RewardedAdSheet: React.FC<RewardedAdSheetProps> = ({
  isOpen,
  onClose,
  rewardType = 'REWARDED_LIKE',
  title,
  description,
  rewardLabel,
}) => {
  const { t } = useAppTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const initSession = useInitRewardSessionMutation();
  const verifySession = useVerifyRewardSessionMutation();
  const [state, setState] = useState<'idle' | 'loading' | 'verifying'>('idle');

  const handleWatchAd = async () => {
    if (!userId || state !== 'idle') return;
    setState('loading');
    try {
      const session = await initSession.mutateAsync(rewardType);
      await nativeAdMob.showRewardedAd(userId, session.ssvCustomData);

      setState('verifying');
      // SSV callbacks typically land within a few seconds of ad completion -- poll briefly
      // rather than forcing the user to reopen the app to see their reward.
      let granted = false;
      for (let attempt = 0; attempt < 5 && !granted; attempt += 1) {
        await wait(2000);
        const result = await verifySession.mutateAsync(session.sessionId);
        if (result?.granted || result?.alreadyClaimed) {
          granted = true;
          toast.success(t('rewardCreditedTemplate').replace('{reward}', rewardLabel));
          onClose();
        }
      }
      if (!granted) {
        toast.show(t('rewardPendingToast'), 'neutral');
        onClose();
      }
    } catch (err: any) {
      if (!/cancel/i.test(err?.message || '')) {
        toast.error(err?.message || t('adLoadFailedMessage'));
      }
    } finally {
      setState('idle');
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={state === 'idle' ? onClose : () => {}}>
      <div className="px-6 pb-6 pt-2 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-pink-500/10 text-pink-500">
          <PlayCircle className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-title text-app">{title}</h2>
        <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">{description}</p>
        <div className="mt-5 space-y-2.5">
          <AppButton
            fullWidth
            size="lg"
            variant="primary"
            loading={state !== 'idle'}
            onClick={handleWatchAd}
          >
            {state === 'verifying' ? t('rewardVerifyingLabel') : t('watchAdLabel')}
          </AppButton>
          {state === 'idle' && (
            <AppButton fullWidth size="md" variant="ghost" onClick={onClose}>
              {t('notNowLabel')}
            </AppButton>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};

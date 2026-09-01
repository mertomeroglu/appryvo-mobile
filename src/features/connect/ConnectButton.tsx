import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { connectPassService, type ConnectStatus, type ConnectSourceType } from '../../services/connect/connectPassService';
import { connectText } from './connectLocale';
import { AppButton } from '../../components/ui/AppButton';
import type { AppLocale } from '../../i18n/appLocale';

interface ConnectButtonProps {
  userId: string;
  locale: AppLocale;
  sourceType: ConnectSourceType;
  sourceRoomId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Shared Connect Pass control for the map user-preview sheet and the room member-preview
 * sheet -- the two surfaces where a person can be contacted without a mutual match (Discover's
 * own swipe screen keeps its separate Like/SuperLike flow untouched). Renders View
 * Profile-adjacent state: Connect (send a paid private intro) / Request Sent / Message (already
 * matched, no charge). Renders nothing for your own id (mirrors FollowButton's own contract). */
export const ConnectButton: React.FC<ConnectButtonProps> = ({ userId, locale, sourceType, sourceRoomId, size = 'md', className }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [intro, setIntro] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus(null);
    connectPassService.status(userId).then((s) => { if (active) setStatus(s); }).catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [userId]);

  if (status?.state === 'SELF') return null;

  const sendIntro = async () => {
    if (!intro.trim()) return;
    setSending(true);
    setError('');
    try {
      await connectPassService.send({ recipientId: userId, introMessage: intro.trim(), sourceType, sourceRoomId });
      setShowIntro(false);
      setStatus({ state: 'PENDING_SENT' });
    } catch (e: any) {
      const code = e?.response?.data?.code;
      setError(
        code === 'INSUFFICIENT_COINS' ? connectText(locale, 'insufficientCoins') :
        code === 'DAILY_LIMIT_REACHED' ? connectText(locale, 'dailyLimitReached') :
        e?.message || 'Error'
      );
    } finally {
      setSending(false);
    }
  };

  if (showIntro) {
    return (
      <div className={className}>
        <p className="mb-2 rounded-2xl border border-app bg-surface p-3 text-caption text-app-muted">{connectText(locale, 'connectExplain')}</p>
        <textarea
          value={intro}
          maxLength={500}
          onChange={(e) => setIntro(e.target.value)}
          placeholder={connectText(locale, 'introPlaceholder')}
          className="h-24 w-full resize-none rounded-2xl border border-app bg-surface p-3"
        />
        {error && <p className="mt-1 text-caption font-bold text-red-500">{error}</p>}
        <div className="mt-2 flex gap-2">
          <AppButton fullWidth size={size} variant="secondary" onClick={() => setShowIntro(false)}>{connectText(locale, 'cancel')}</AppButton>
          <AppButton fullWidth size={size} variant="primary" loading={sending} disabled={!intro.trim()} onClick={sendIntro}>{connectText(locale, 'send')}</AppButton>
        </div>
      </div>
    );
  }

  if (status?.state === 'MATCHED') {
    return (
      <AppButton fullWidth size={size} variant="primary" className={className} onClick={() => navigate(`/chat/${status.matchId}`)}>
        {connectText(locale, 'message')}
      </AppButton>
    );
  }
  if (status?.state === 'PENDING_SENT') {
    return <AppButton fullWidth size={size} variant="secondary" disabled className={className}>{connectText(locale, 'requestSent')}</AppButton>;
  }
  return (
    <AppButton fullWidth size={size} variant="primary" leftIcon={<Star className="w-4 h-4" />} className={className} onClick={() => setShowIntro(true)}>
      {connectText(locale, 'connectCostLabel')}
    </AppButton>
  );
};

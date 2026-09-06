import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import { useCallHistoryQuery } from '../../hooks/useQueries';
import { useAppTranslation } from '../../i18n/appLocale';
import { IconButton } from '../../components/ui/IconButton';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { Skeleton } from '../../components/ui/Skeleton';

function duration(seconds: number) {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export const CallHistoryScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale } = useAppTranslation();
  const { data = [], isLoading } = useCallHistoryQuery();
  return <div className="flex h-full flex-col overflow-y-auto bg-app p-4 pb-24 text-app no-scrollbar">
    <header className="pt-safe mb-4 flex min-h-[calc(3.5rem+var(--safe-top))] items-center gap-3"><IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></IconButton><h1 className="text-title">{t('callHistoryLabel')}</h1></header>
    {isLoading ? <div className="space-y-3"><Skeleton variant="card" /><Skeleton variant="card" /></div> : <div className="space-y-2">{data.map((call: any) => {
      const missed = String(call.status).toUpperCase() === 'MISSED' || String(call.endReason).toLowerCase() === 'missed';
      return <button key={call.id} type="button" onClick={() => call.partnerId && navigate(`/profile/${call.partnerId}`)} className="flex w-full items-center gap-3 rounded-2xl border border-app bg-surface p-3 text-start shadow-soft">
        <ProfileAvatarFrame photoUrl={call.partnerPhotoUrl} name={call.partnerName} size="sm" />
        <div className="min-w-0 flex-1"><p className="truncate text-body font-bold text-app">{call.partnerName}</p><p className={`mt-0.5 flex items-center gap-1 text-caption normal-case ${missed ? 'text-red-500' : 'text-app-muted'}`}>{call.isCaller ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}{new Date(call.startedAt).toLocaleString(locale)}{duration(Number(call.durationSeconds)) && ` · ${duration(Number(call.durationSeconds))}`}</p></div>
        {String(call.type).toLowerCase() === 'video' ? <Video className="h-5 w-5 text-app-muted" /> : <Phone className="h-5 w-5 text-app-muted" />}
      </button>;
    })}</div>}
  </div>;
};

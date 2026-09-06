import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserX } from 'lucide-react';
import { useBlockedUsersQuery, useUnblockMutation } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { toast } from '../../stores/useToastStore';
import { useAppTranslation } from '../../i18n/appLocale';
import { ScreenHeader } from '../../components/ui/ScreenHeader';

export const BlockedUsersScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { data: blocked, isLoading } = useBlockedUsersQuery();
  const unblockMutation = useUnblockMutation();

  const blockedList = blocked || [];

  const handleUnblock = (userId: string, name?: string) => {
    unblockMutation.mutate(userId, {
      onSuccess: () => toast.success(t('userUnblockedToastTemplate').replace('{name}', name || t('genericUserLabel'))),
      onError: () => toast.error(t('unblockFailedToast')),
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none">
      <ScreenHeader leading={<IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></IconButton>} title={t('blockedUsersTitle')} />

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {isLoading ? (
          <LoadingState fullScreen={false} message={t('loadingMessage')} />
        ) : blockedList.length === 0 ? (
          <div className="my-auto py-16">
            <EmptyState
              icon={<UserX className="w-7 h-7" />}
              title={t('blockedUsersEmptyTitle')}
              subtitle={t('blockedUsersEmptySubtitle')}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {blockedList.map((item: any) => {
              const u = item.user || item;
              return (
                <div
                  key={u.id}
                  className="w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center gap-3 shadow-soft"
                >
                  <Avatar
                    src={u.photoUrl || u.photos?.[0]?.url ? normalizeMediaUrl(u.photoUrl || u.photos?.[0]?.url) : undefined}
                    name={u.name}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-body font-bold text-app truncate">{u.name || t('genericUserLabel')}</h4>
                  </div>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    loading={unblockMutation.isPending}
                    onClick={() => handleUnblock(u.id, u.name)}
                  >
                    {t('removeButtonLabel')}
                  </AppButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useFollowMutation, useFollowStatusQuery, useUnfollowMutation } from '../hooks/useQueries';
import { useAuthStore } from '../stores/useAuthStore';
import { AppButton } from './ui/AppButton';
import { useAppTranslation } from '../i18n/appLocale';

interface FollowButtonProps {
  userId: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Shared follow/unfollow control for any full-profile surface. Renders nothing for your own
 * profile -- following yourself isn't a state this button can express. */
export const FollowButton: React.FC<FollowButtonProps> = ({ userId, size = 'md', className }) => {
  const { t } = useAppTranslation();
  const selfId = useAuthStore((s) => s.user?.id);
  const { data: status, isLoading } = useFollowStatusQuery(userId);
  const followMutation = useFollowMutation();
  const unfollowMutation = useUnfollowMutation();

  if (!userId || userId === selfId) return null;

  const isFollowing = status?.isFollowing === true;
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  const handleClick = () => {
    if (isPending) return;
    if (isFollowing) unfollowMutation.mutate(userId);
    else followMutation.mutate(userId);
  };

  return (
    <AppButton
      type="button"
      variant={isFollowing ? 'secondary' : 'primary'}
      size={size}
      loading={isPending}
      disabled={isLoading}
      onClick={handleClick}
      leftIcon={isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
      className={className}
    >
      {isFollowing ? t('followingLabel') : t('followLabel')}
    </AppButton>
  );
};

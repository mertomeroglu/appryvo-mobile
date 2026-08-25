import React from 'react';
import { BellOff, Camera, LockKeyhole, MapPinOff, MicOff } from 'lucide-react';
import { useAppTranslation } from '../../i18n/appLocale';

interface PermissionDeniedStateProps {
  permissionType?: 'location' | 'camera' | 'microphone' | 'notifications';
  onRequestPermission?: () => void;
}

export const PermissionDeniedState: React.FC<PermissionDeniedStateProps> = ({
  permissionType = 'location',
  onRequestPermission,
}) => {
  const { t } = useAppTranslation();
  const icons = {
    location: <MapPinOff className="h-8 w-8" aria-hidden="true" />,
    camera: <Camera className="h-8 w-8" aria-hidden="true" />,
    microphone: <MicOff className="h-8 w-8" aria-hidden="true" />,
    notifications: <BellOff className="h-8 w-8" aria-hidden="true" />,
  };
  const titles = {
    location: t('permissionLocationTitle'),
    camera: t('permissionCameraTitle'),
    microphone: t('permissionMicrophoneTitle'),
    notifications: t('permissionNotificationsTitle'),
  };

  const descriptions = {
    location: t('permissionLocationDesc'),
    camera: t('permissionCameraDesc'),
    microphone: t('permissionMicrophoneDesc'),
    notifications: t('permissionNotificationsDesc'),
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto my-auto">
      <div className="w-20 h-20 rounded-3xl bg-surface border border-app shadow-soft flex items-center justify-center text-brand-pink mb-6">
        {icons[permissionType] || <LockKeyhole className="h-8 w-8" aria-hidden="true" />}
      </div>
      <h2 className="text-xl font-extrabold text-app mb-2">{titles[permissionType]}</h2>
      <p className="text-sm text-app-muted max-w-xs mb-6 leading-relaxed">
        {descriptions[permissionType]}
      </p>
      {onRequestPermission && (
        <button
          onClick={onRequestPermission}
          className="h-13 px-8 rounded-2xl bg-brand-gradient text-white font-extrabold text-sm shadow-md active:scale-95 transition-transform"
        >
          {t('grantPermissionButton')}
        </button>
      )}
    </div>
  );
};

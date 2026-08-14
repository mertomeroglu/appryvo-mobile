import React from 'react';

interface PermissionDeniedStateProps {
  permissionType?: 'location' | 'camera' | 'microphone' | 'notifications';
  onRequestPermission?: () => void;
}

export const PermissionDeniedState: React.FC<PermissionDeniedStateProps> = ({
  permissionType = 'location',
  onRequestPermission,
}) => {
  const titles = {
    location: 'Konum İzni Gerekli',
    camera: 'Kamera İzni Gerekli',
    microphone: 'Mikrofon İzni Gerekli',
    notifications: 'Bildirim İzni Gerekli',
  };

  const descriptions = {
    location: 'Yakınındaki kişileri ve haritayı görebilmek için konum izni vermelisin.',
    camera: 'Profiline fotoğraf eklemek veya görüntülü arama yapmak için kamera izni gerekli.',
    microphone: 'Sesli mesaj göndermek ve sesli aramalar için mikrofon izni gerekli.',
    notifications: 'Eşleşmelerden ve mesajlardan anında haberdar olmak için bildirim iznini aç.',
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto my-auto">
      <div className="w-20 h-20 rounded-3xl bg-surface border border-app shadow-md flex items-center justify-center text-4xl mb-6">
        🔒
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
          İzin Ver
        </button>
      )}
    </div>
  );
};

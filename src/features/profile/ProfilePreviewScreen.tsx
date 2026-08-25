import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { normalizeMediaUrl, getPhotoUrl } from '../../services/media/mediaService';
import { IconButton } from '../../components/ui/IconButton';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { ZodiacIcon } from '../../components/ui/ZodiacIcon';
import { normalizeCountryCode } from '../../lib/countryFlags';
import { getRelationshipGoalLabels, getZodiacLabel } from '../../lib/profileLabels';
import { useAppTranslation } from '../../i18n/appLocale';

function normalizePhotos(user: any): string[] {
  if (Array.isArray(user?.photos) && user.photos.length > 0) {
    return user.photos.map((p: any) => getPhotoUrl(p)).filter(Boolean);
  }
  return user?.photoUrl ? [user.photoUrl] : [];
}

export const ProfilePreviewScreen: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { locale } = useAppTranslation();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = normalizePhotos(user);
  const showFlag = user?.showCountryFlag !== false && !!normalizeCountryCode(user?.countryCode);

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar bg-app text-app">
      <div className="sticky top-0 z-sticky pt-safe px-4 pb-2 bg-brand-gradient text-center">
        <p className="text-micro font-bold text-white/90 py-2">Profilin diğer kullanıcılara böyle görünüyor</p>
      </div>

      <div className="relative w-full h-[58vh] max-h-[520px] bg-app-secondary overflow-hidden">
        {photos[photoIndex] ? (
          <img src={normalizeMediaUrl(photos[photoIndex])} alt={user?.name} className="w-full h-full object-cover" />
        ) : null}

        {photos.length > 1 && (
          <>
            <div className="absolute top-4 inset-x-4 flex gap-1.5 z-20">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className={`h-[3px] flex-1 rounded-full transition-colors ${
                    i === photoIndex ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
            <div className="absolute inset-x-0 top-0 h-[85%] flex z-10">
              <button className="w-1/2 h-full" onClick={() => setPhotoIndex((i) => Math.max(i - 1, 0))} />
              <button className="w-1/2 h-full" onClick={() => setPhotoIndex((i) => Math.min(i + 1, photos.length - 1))} />
            </div>
          </>
        )}

        <div className="absolute top-4 start-4 z-20">
          <IconButton aria-label="Geri" variant="overlay" size="md" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-6 text-white z-10">
          <div className="flex items-end gap-3">
            <ProfileAvatarFrame
              photoUrl={photos[0]}
              name={user?.name}
              activeFrameId={user?.activeFrameId}
              verified={user?.verified}
              countryCode={showFlag ? user?.countryCode : null}
              showCountryFlag={showFlag}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h1 className="text-3xl font-black">{user?.name}</h1>
                {user?.age && <span className="text-2xl font-bold text-gray-300">{user.age}</span>}
                {user?.verified && <ShieldCheck className="w-6 h-6 text-[#32D583]" />}
              </div>
              {user?.city && (
                <div className="flex items-center gap-1.5 text-xs text-gray-300 mt-1">
                  <MapPin className="w-4 h-4 text-pink-500" />
                  <span>{user.city}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {user?.bio && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">Hakkımda</h4>
            <p className="text-body text-app leading-relaxed">{user.bio}</p>
          </div>
        )}

        {getRelationshipGoalLabels(user?.relationshipGoals || user?.relationshipGoal).length > 0 && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">Aradığı</h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {getRelationshipGoalLabels(user?.relationshipGoals || user?.relationshipGoal).map((label) => (
                <span key={label} className="text-caption px-3 py-1.5 rounded-full bg-app-secondary border border-app text-app font-semibold">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {user?.zodiac && getZodiacLabel(user.zodiac, locale) && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">Burç</h4>
            <p className="flex items-center gap-2 text-heading text-app">
              <ZodiacIcon sign={user.zodiac} size={20} className="text-purple-400" />
              {getZodiacLabel(user.zodiac, locale)}
            </p>
          </div>
        )}

        {Array.isArray(user?.interests) && user.interests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">İlgi Alanları</h4>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest: string, idx: number) => (
                <span
                  key={idx}
                  className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

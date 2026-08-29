import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Cigarette, Languages, MapPin, Ruler, ShieldCheck, Volume2, Wine } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { normalizeMediaUrl, getPhotoUrl } from '../../services/media/mediaService';
import { IconButton } from '../../components/ui/IconButton';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { ZodiacIcon } from '../../components/ui/ZodiacIcon';
import { normalizeCountryCode } from '../../lib/countryFlags';
import {
  getRelationshipGoalLabels,
  getZodiacLabel,
  formatDisplayAge,
  getSmokingLabel,
  getDrinkingLabel,
  getChildrenStatusLabel,
  getFamilyPlansLabel,
} from '../../lib/profileLabels';
import { useAppTranslation } from '../../i18n/appLocale';
import { getLocalizedInterestLabel } from '../../lib/interestLabels';
import { getLocalizedStoredLanguageName } from '../../lib/languages';

function normalizePhotos(user: any): string[] {
  if (Array.isArray(user?.photos) && user.photos.length > 0) {
    return user.photos.map((p: any) => getPhotoUrl(p)).filter(Boolean);
  }
  return user?.photoUrl ? [user.photoUrl] : [];
}

export const ProfilePreviewScreen: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { locale, t } = useAppTranslation();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = normalizePhotos(user);
  const showFlag = user?.showCountryFlag !== false && !!normalizeCountryCode(user?.countryCode);

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar bg-app text-app">
      <div className="sticky top-0 z-sticky pt-safe px-4 pb-2 bg-brand-gradient text-center">
        <p className="text-micro font-bold text-white/90 py-2">{t('profilePreviewBannerText')}</p>
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
          <IconButton aria-label={t('backButtonLabel')} variant="overlay" size="md" onClick={() => navigate(-1)}>
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
                {formatDisplayAge(user?.age) !== undefined && <span className="text-2xl font-bold text-gray-300">{formatDisplayAge(user?.age)}</span>}
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
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('bioSectionLabel')}</h4>
            <p className="text-body text-app leading-relaxed">{user.bio}</p>
          </div>
        )}

        {getRelationshipGoalLabels(user?.relationshipGoals || user?.relationshipGoal, locale).length > 0 && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileLookingForLabel')}</h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {getRelationshipGoalLabels(user?.relationshipGoals || user?.relationshipGoal, locale).map((label) => (
                <span key={label} className="text-caption px-3 py-1.5 rounded-full bg-app-secondary border border-app text-app font-semibold">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {user?.job && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileBasicInfoLabel')}</h4>
            <p className="flex items-center gap-2 text-body text-app">
              <Briefcase className="w-4 h-4 text-app-muted" />
              {user.job}
            </p>
          </div>
        )}

        {(user?.zodiac || user?.heightCm || getSmokingLabel(user?.smokingStatus, locale) || getDrinkingLabel(user?.drinkingStatus, locale) ||
          getChildrenStatusLabel(user?.childrenStatus, locale) || getFamilyPlansLabel(user?.familyPlans, locale)) && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('lifestyleSectionLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user?.zodiac && getZodiacLabel(user.zodiac, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <ZodiacIcon sign={user.zodiac} className="text-purple-400" />
                  {getZodiacLabel(user.zodiac, locale)}
                </span>
              )}
              {user?.heightCm && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Ruler className="w-3.5 h-3.5 text-indigo-400" />
                  {user.heightCm} cm
                </span>
              )}
              {getSmokingLabel(user?.smokingStatus, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Cigarette className="w-3.5 h-3.5 text-app-muted" />
                  {getSmokingLabel(user?.smokingStatus, locale)}
                </span>
              )}
              {getDrinkingLabel(user?.drinkingStatus, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Wine className="w-3.5 h-3.5 text-app-muted" />
                  {getDrinkingLabel(user?.drinkingStatus, locale)}
                </span>
              )}
              {getChildrenStatusLabel(user?.childrenStatus, locale) && (
                <span className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  {getChildrenStatusLabel(user?.childrenStatus, locale)}
                </span>
              )}
              {getFamilyPlansLabel(user?.familyPlans, locale) && (
                <span className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  {getFamilyPlansLabel(user?.familyPlans, locale)}
                </span>
              )}
            </div>
          </div>
        )}

        {Array.isArray(user?.languages) && user.languages.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileSpokenLanguagesLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user.languages.map((lang: string, idx: number) => (
                <span
                  key={idx}
                  className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium"
                >
                  <Languages className="w-3.5 h-3.5 text-teal-400" />
                  {getLocalizedStoredLanguageName(lang, locale)}
                </span>
              ))}
            </div>
          </div>
        )}

        {user?.voicePrompt?.url && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 p-4 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-pink-500 text-white">
                <Volume2 className="w-5 h-5" />
              </div>
              <h4 className="text-caption font-bold text-app">{t('fullProfileVoiceIntroLabel')}</h4>
            </div>
            <audio src={normalizeMediaUrl(user.voicePrompt.url)} controls className="w-full h-9" />
          </div>
        )}

        {Array.isArray(user?.interests) && user.interests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('interestsSectionLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest: string, idx: number) => (
                <span
                  key={idx}
                  className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium"
                >
                  {getLocalizedInterestLabel(interest, locale)}
                </span>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(user?.prompts) && user.prompts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfilePromptsLabel')}</h4>
            {user.prompts.map((prompt: any, idx: number) => {
              const question = prompt?.question || prompt?.prompt;
              const answer = prompt?.answer;
              if (!question || !answer) return null;
              return (
                <div key={idx} className="bg-surface border border-app p-4 rounded-2xl space-y-1">
                  <h5 className="text-micro text-app-muted">{question}</h5>
                  <p className="text-body text-app">{answer}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { AtSign, Briefcase, Camera as CameraIcon, ChevronRight, LockKeyhole, Plus, Ruler, Sparkles, User, X } from 'lucide-react';
import { apiClient } from '../services/api/apiClient';
import { mediaService, normalizeMediaUrl, getPhotoUrl } from '../services/media/mediaService';
import { nativeCamera } from '../native/camera';
import { useAuthStore } from '../stores/useAuthStore';
import { toast } from '../stores/useToastStore';
import { AppButton } from './ui/AppButton';
import { AppLogo } from './ui/AppLogo';
import { IconButton } from './ui/IconButton';
import { Chip, FilterChip } from './ui/Chip';
import { PhotoCropScreen } from './ui/PhotoCropScreen';
import { InterestsEditorScreen } from './InterestsEditorScreen';
import { ProfileQuestionsManager } from '../features/questions/ProfileQuestionsEditor';
import { useQuestionText } from '../features/questions/questionLocale';
import { useOwnProfileQuestionsQuery } from '../hooks/useQuestionQueries';
import { QUERY_KEYS } from '../hooks/useQueries';
import { LanguageSelector } from './LanguageSelector';
import { ZodiacIcon, ZODIAC_ACCENT_CLASSES, type ZodiacSign } from './ui/ZodiacIcon';
import {
  getRelationshipGoalLabel,
  getSmokingLabel,
  getDrinkingLabel,
  getChildrenStatusLabel,
  getFamilyPlansLabel,
  getZodiacLabel,
} from '../lib/profileLabels';
import { INTEREST_MAX, INTEREST_MIN } from '../lib/interests';
import { getLocalizedInterestLabel } from '../lib/interestLabels';
import { normalizeLanguageNames } from '../lib/languages';
import { useAppTranslation } from '../i18n/appLocale';
import { ProfileCreativeEditor } from './ProfileCreativeEditor';

// Enum key order only -- the display TEXT is resolved per-locale at render time via the
// getXLabel() functions above, never read as a fixed object here.
const RELATIONSHIP_GOAL_KEYS = ['LONG_TERM', 'SHORT_TERM', 'FRIENDSHIP', 'OPEN_TO_EXPLORING', 'NOT_SURE'];
const SMOKING_KEYS = ['NEVER', 'SOMETIMES', 'SOCIALLY', 'REGULARLY'];
const DRINKING_KEYS = ['NEVER', 'SOMETIMES', 'SOCIALLY', 'REGULARLY'];
const CHILDREN_KEYS = ['NO_CHILDREN', 'HAS_CHILDREN'];
const FAMILY_PLAN_KEYS = ['WANTS_CHILDREN', 'DOES_NOT_WANT_CHILDREN', 'OPEN_TO_CHILDREN', 'NOT_SURE'];
const ZODIAC_KEYS = ['ARIES', 'TAURUS', 'GEMINI', 'CANCER', 'LEO', 'VIRGO', 'LIBRA', 'SCORPIO', 'SAGITTARIUS', 'CAPRICORN', 'AQUARIUS', 'PISCES'];

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Profile-completion field key (see lib/profileCompletion.ts) to scroll straight to on open. */
  focusSection?: string;
}

// Maps a completion-CTA field key to the data-section anchor it should scroll to.
const SECTION_ANCHORS: Record<string, string> = {
  photos: 'photos',
  bio: 'bio',
  interests: 'interests',
  languages: 'languages',
  smokingStatus: 'smokingStatus',
  drinkingStatus: 'drinkingStatus',
};

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;

interface PhotoSlot {
  id: string;
  url: string;
  uploading: boolean;
}

function normalizeInitialPhotos(photos: any[] | undefined): PhotoSlot[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p, i) => ({
      id: `existing-${i}`,
      url: getPhotoUrl(p) || '',
      uploading: false,
    }))
    .filter((p) => p.url);
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, focusSection }) => {
  const user = useAuthStore((s) => s.user);
  const { locale, t } = useAppTranslation();
  const { qt } = useQuestionText();
  const { data: ownQuestions } = useOwnProfileQuestionsQuery();
  const RELATIONSHIP_GOALS = RELATIONSHIP_GOAL_KEYS.map((value) => ({ value, label: getRelationshipGoalLabel(value, locale) || value }));
  const SMOKING_OPTIONS = SMOKING_KEYS.map((value) => ({ value, label: getSmokingLabel(value, locale) || value }));
  const DRINKING_OPTIONS = DRINKING_KEYS.map((value) => ({ value, label: getDrinkingLabel(value, locale) || value }));
  const CHILDREN_OPTIONS = CHILDREN_KEYS.map((value) => ({ value, label: getChildrenStatusLabel(value, locale) || value }));
  const FAMILY_PLAN_OPTIONS = FAMILY_PLAN_KEYS.map((value) => ({ value, label: getFamilyPlansLabel(value, locale) || value }));
  const ZODIAC_OPTIONS = ZODIAC_KEYS.map((value) => ({ value, label: getZodiacLabel(value, locale) || value }));
  const queryClient = useQueryClient();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const setUser = useAuthStore((s) => s.setUser);

  const [photos, setPhotos] = useState<PhotoSlot[]>(() => normalizeInitialPhotos(user?.photos));
  const [bio, setBio] = useState(user?.bio || '');
  const [job, setJob] = useState(user?.job || '');
  const [city, setCity] = useState(user?.city || '');
  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>(() => {
    if (Array.isArray(user?.relationshipGoals) && user.relationshipGoals.length > 0) {
      return user.relationshipGoals.slice(0, 2);
    }
    return user?.relationshipGoal ? [user.relationshipGoal] : [];
  });
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [isQuestionsEditorOpen, setIsQuestionsEditorOpen] = useState(false);
  const [heightCm, setHeightCm] = useState(user?.heightCm ? String(user.heightCm) : '');
  const [zodiac, setZodiac] = useState(user?.zodiac || '');
  const [smokingStatus, setSmokingStatus] = useState(user?.smokingStatus || '');
  const [drinkingStatus, setDrinkingStatus] = useState(user?.drinkingStatus || '');
  const [childrenStatus, setChildrenStatus] = useState(user?.childrenStatus || '');
  const [familyPlans, setFamilyPlans] = useState(user?.familyPlans || '');
  const [languages, setLanguages] = useState<string[]>(() => normalizeLanguageNames(user?.languages || []));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cropQueue, setCropQueue] = useState<Blob[]>([]);
  const [cropSource, setCropSource] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isSavingRef = useRef(false);
  const [isInterestsEditorOpen, setIsInterestsEditorOpen] = useState(false);

  // Snapshot of every editable field as loaded, captured once (the modal fully unmounts on close
  // per OwnProfileScreen, so there's no need to react to `user` changing later). Everything below
  // that can actually change value is compared against this to drive the sticky Save affordance --
  // previously there was no dirty-state concept at all, so a change to any field (including photo
  // add/remove/reorder) was invisible until the user scrolled to the bottom submit button.
  const initialSnapshotRef = useRef<{
    photoKeys: string[];
    bio: string;
    job: string;
    city: string;
    relationshipGoals: string[];
    interests: string[];
    heightCm: string;
    zodiac: string;
    smokingStatus: string;
    drinkingStatus: string;
    childrenStatus: string;
    familyPlans: string;
    languages: string[];
  } | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = {
      photoKeys: normalizeInitialPhotos(user?.photos).map((p) => p.url),
      bio: user?.bio || '',
      job: user?.job || '',
      city: user?.city || '',
      relationshipGoals:
        Array.isArray(user?.relationshipGoals) && user.relationshipGoals.length > 0
          ? user.relationshipGoals.slice(0, 2)
          : user?.relationshipGoal
            ? [user.relationshipGoal]
            : [],
      interests: user?.interests || [],
      heightCm: user?.heightCm ? String(user.heightCm) : '',
      zodiac: user?.zodiac || '',
      smokingStatus: user?.smokingStatus || '',
      drinkingStatus: user?.drinkingStatus || '',
      childrenStatus: user?.childrenStatus || '',
      familyPlans: user?.familyPlans || '',
      languages: normalizeLanguageNames(user?.languages || []),
    };
  }

  useEffect(() => {
    if (!isOpen || !focusSection) return;
    const anchor = SECTION_ANCHORS[focusSection];
    if (!anchor) return;
    const raf = requestAnimationFrame(() => {
      const el = formRef.current?.querySelector(`[data-section="${anchor}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, focusSection]);

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  // A pending upload has no url yet, but adding/removing a photo is itself a change -- keying on
  // `photo.id` for uploading slots (never present in the initial snapshot) means the Save
  // affordance appears the instant a photo is added, not only once its upload finishes.
  const currentPhotoKeys = photos.map((p) => p.url || `pending:${p.id}`);
  const isDirty = useMemo(() => {
    const snap = initialSnapshotRef.current!;
    return (
      JSON.stringify(currentPhotoKeys) !== JSON.stringify(snap.photoKeys) ||
      bio !== snap.bio ||
      job !== snap.job ||
      city !== snap.city ||
      JSON.stringify(relationshipGoals) !== JSON.stringify(snap.relationshipGoals) ||
      JSON.stringify(interests) !== JSON.stringify(snap.interests) ||
      heightCm !== snap.heightCm ||
      zodiac !== snap.zodiac ||
      smokingStatus !== snap.smokingStatus ||
      drinkingStatus !== snap.drinkingStatus ||
      childrenStatus !== snap.childrenStatus ||
      familyPlans !== snap.familyPlans ||
      JSON.stringify(languages) !== JSON.stringify(snap.languages)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhotoKeys.join('|'), bio, job, city, relationshipGoals, interests, heightCm, zodiac, smokingStatus, drinkingStatus, childrenStatus, familyPlans, languages]);

  if (!isOpen) return null;

  const toggleRelationshipGoal = (value: string) => {
    setRelationshipGoals((current) => {
      if (current.includes(value)) return current.filter((goal) => goal !== value);
      if (current.length >= 2) {
        toast.show(t('relationshipGoalMaxToast'), 'neutral');
        return current;
      }
      return [...current, value];
    });
  };

  const uploadPhoto = async (file: File | Blob) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPhotos((prev) => [...prev, { id, url: '', uploading: true }]);
    try {
      const res = await mediaService.uploadMedia(file, 'profile');
      const url = res?.data?.url;
      if (!url) throw new Error('Upload failed');
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, url, uploading: false } : p)));
    } catch {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      toast.error(t('photoUploadFailedToast'));
    }
  };

  // Selected photos go through the crop screen (one at a time) before ever
  // reaching uploadPhoto — no intermediate "which one do you want to edit"
  // prompt, straight from picker into the adjustment screen.
  const enqueueForCrop = (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    setCropQueue((prev) => [...prev, ...blobs]);
    setCropSource((prev) => prev ?? URL.createObjectURL(blobs[0]));
  };

  const handleAddPhotos = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    if (Capacitor.isNativePlatform()) {
      const uris = await nativeCamera.pickImages();
      const blobs: Blob[] = [];
      for (const uri of uris.slice(0, MAX_PHOTOS - photos.length)) {
        try {
          blobs.push(await fetch(uri).then((r) => r.blob()));
        } catch {
          toast.error(t('photoProcessFailedToast'));
        }
      }
      enqueueForCrop(blobs);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - photos.length);
    enqueueForCrop(files);
    e.target.value = '';
  };

  const advanceCropQueue = (rest: Blob[]) => {
    setCropQueue(rest);
    setCropSource((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return rest.length > 0 ? URL.createObjectURL(rest[0]) : null;
    });
  };

  const handleCropConfirm = (croppedBlob: Blob) => {
    uploadPhoto(croppedBlob);
    advanceCropQueue(cropQueue.slice(1));
  };

  const handleUseOriginalPhoto = () => {
    const originalBlob = cropQueue[0];
    if (!originalBlob) return;
    uploadPhoto(originalBlob);
    advanceCropQueue(cropQueue.slice(1));
  };

  const handleCropCancel = () => {
    advanceCropQueue(cropQueue.slice(1));
  };

  const removePhoto = (id: string) => {
    if (photos.length <= MIN_PHOTOS) {
      toast.error(t('minPhotosRemainingToast'));
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Nothing changed -- skip the network round-trip entirely (the bottom-of-form submit button
    // has no dirty guard of its own, unlike the sticky header one which only renders when dirty).
    if (!isDirty) return;
    // Belt-and-suspenders against double taps: guards the instant between a fast second tap and
    // React re-rendering AppButton's disabled state from isLoading.
    if (isSavingRef.current) return;
    const tStart = performance.now();
    setErrorMsg('');
    if (photos.some((photo) => photo.uploading)) {
      setErrorMsg(t('photosUploadingWaitError'));
      return;
    }
    if (photos.filter((photo) => photo.url).length < MIN_PHOTOS) {
      setErrorMsg(t('minPhotosRequiredError'));
      return;
    }
    if (relationshipGoals.length < 1 || relationshipGoals.length > 2) {
      setErrorMsg(t('relationshipGoalCountError'));
      return;
    }
    if (interests.length < INTEREST_MIN || interests.length > INTEREST_MAX) {
      setErrorMsg(t('interestsCountErrorTemplate').replace('{min}', String(INTEREST_MIN)).replace('{max}', String(INTEREST_MAX)));
      return;
    }
    const tValidated = performance.now();
    isSavingRef.current = true;
    setIsLoading(true);
    try {
      const parsedHeight = heightCm.trim() ? Number.parseInt(heightCm, 10) : undefined;
      if (parsedHeight !== undefined && (!Number.isFinite(parsedHeight) || parsedHeight < 100 || parsedHeight > 210)) {
        setErrorMsg(t('invalidHeightError'));
        setIsLoading(false);
        return;
      }
      const photoUrls = photos.filter((photo) => photo.url).map((photo) => photo.url);
      const initialPhotoUrls = normalizeInitialPhotos(user?.photos).map((photo) => photo.url);
      const photosChanged =
        photoUrls.length !== initialPhotoUrls.length || photoUrls.some((url, index) => url !== initialPhotoUrls[index]);
      const payload: Record<string, unknown> = {
        bio,
        job: job.trim(),
        ...(city !== initialSnapshotRef.current!.city ? { city, cityId } : {}),
        interests,
        relationshipGoal: relationshipGoals[0],
        relationshipGoals,
        heightCm: Number.isFinite(parsedHeight) ? parsedHeight : undefined,
        zodiac: zodiac || null,
        smokingStatus: smokingStatus || undefined,
        drinkingStatus: drinkingStatus || undefined,
        childrenStatus: childrenStatus || undefined,
        familyPlans: familyPlans || undefined,
        languages,
        ...(photosChanged ? { photos: photoUrls } : {}),
      };

      // Unchanged photos must not be resent: the server treats a `photos` array as a request to
      // run face checks and rewrite every user_photos row. Most saves now stay on the fast path.
      const tRequestStart = performance.now();
      const saveResponse = await apiClient.put('/api/profile', payload, { timeoutMs: photosChanged ? 45000 : 15000 });
      const tRequestEnd = performance.now();
      if (user) {
        const canonicalPhotos = Array.isArray(saveResponse?.data?.photos)
          ? saveResponse.data.photos
          : photoUrls;
        const optimisticUser = {
          ...user,
          bio,
          job: job.trim(),
          city,
          interests,
          relationshipGoal: relationshipGoals[0],
          relationshipGoals,
          heightCm: Number.isFinite(parsedHeight) ? parsedHeight : undefined,
          zodiac: zodiac || null,
          smokingStatus: smokingStatus || undefined,
          drinkingStatus: drinkingStatus || undefined,
          childrenStatus: childrenStatus || undefined,
          familyPlans: familyPlans || undefined,
          languages,
          ...(photosChanged ? { photos: canonicalPhotos } : {}),
        };
        setUser(optimisticUser);
        queryClient.setQueryData(QUERY_KEYS.me, optimisticUser);
      }
      onClose();
      toast.success(t('profileSavedToast'));
      // Timings only -- never the payload itself. UI has already closed/succeeded by this point;
      // this refetch reconciles cache in the background and never blocks the save from finishing.
      console.info('[PROFILE SAVE]', JSON.stringify({
        validationMs: Math.round(tValidated - tStart),
        requestMs: Math.round(tRequestEnd - tRequestStart),
        totalMs: Math.round(performance.now() - tStart),
        photosChanged,
      }));
      void fetchMe().catch(() => {});
    } catch (err: any) {
      // The inline error box lives at the bottom of a long scrollable form -- a toast makes the
      // failure visible immediately even if the save was triggered from the sticky header button
      // and the user never scrolls down. Form state is untouched either way, so nothing is lost.
      const message = err.message || t('profileSaveFailedError');
      setErrorMsg(message);
      toast.error(message);
    } finally {
      isSavingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
      <div className="w-full max-w-md bg-surface border border-app rounded-none sm:rounded-3xl h-[100dvh] sm:h-auto sm:max-h-[85vh] overflow-hidden shadow-floating flex flex-col text-app select-none">
        {/* Header */}
        <header className="px-5 pb-4 pt-[calc(var(--safe-top)+16px)] sm:pt-4 border-b border-app bg-surface flex items-center justify-between gap-3 z-sticky shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <AppLogo size="sm" variant="icon" className="shrink-0" />
            <h3 className="text-heading text-app truncate">{t('editProfileTitle')}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Appears the instant any field becomes dirty (see isDirty above) so saving never
                requires scrolling to the bottom-of-form submit button; stays visible (with a
                spinner) through the save so a fast second tap can't double-submit. */}
            {isDirty && (
              <AppButton
                type="button"
                variant="primary"
                size="sm"
                loading={isLoading}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {t('saveButtonShortLabel')}
              </AppButton>
            )}
            <IconButton aria-label={t('closeAriaLabel')} variant="ghost" size="md" onClick={onClose} className="shrink-0">
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        </header>

        {/* Scrollable Form Body */}
        <form ref={formRef} onSubmit={handleSave} className="p-5 space-y-6 flex-1 overflow-y-auto no-scrollbar">
          {/* Photos — first, per the design system's mobile edit-flow order */}
          <div className="space-y-2" data-section="photos">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('photosSectionLabel')}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="grid grid-cols-3 gap-2.5">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-input-app border border-app"
                >
                  {photo.uploading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-t-pink-500 border-r-purple-500 border-b-transparent border-l-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <img
                        src={normalizeMediaUrl(photo.url)}
                        alt={t('profilePhotoAlt')}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 end-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center before:absolute before:-inset-2 before:content-['']"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={handleAddPhotos}
                  className="aspect-[3/4] rounded-2xl border-2 border-dashed border-app bg-app-secondary flex flex-col items-center justify-center gap-1 text-app-muted"
                >
                  <CameraIcon className="w-5 h-5" />
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="space-y-3">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('basicInfoLabel')}</label>
            <div className="space-y-1.5">
              <div className="relative">
                <User className="absolute start-3.5 top-3.5 w-4 h-4 text-app-muted" />
                <input
                  type="text"
                  aria-label={t('nameFieldAriaLabel')}
                  value={user?.name || ''}
                  readOnly
                  aria-readonly="true"
                  className="w-full bg-input-app border border-app rounded-2xl ps-10 pe-10 py-2.5 text-body font-semibold text-app-muted cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40"
                />
                <LockKeyhole className="absolute end-3.5 top-3.5 w-4 h-4 text-app-muted/70" aria-hidden="true" />
              </div>
              <p className="px-1 text-micro normal-case text-app-muted">{t('nameLockedHint')}</p>
            </div>
            <div className="space-y-1.5">
              <div className="relative">
                <AtSign className="absolute start-3.5 top-3.5 w-4 h-4 text-app-muted" />
                <input
                  type="text"
                  aria-label={t('usernameFieldAriaLabel')}
                  value={user?.username || ''}
                  readOnly
                  aria-readonly="true"
                  className="w-full bg-input-app border border-app rounded-2xl ps-10 pe-10 py-2.5 text-body font-semibold text-app-muted cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40"
                />
                <LockKeyhole className="absolute end-3.5 top-3.5 w-4 h-4 text-app-muted/70" aria-hidden="true" />
              </div>
              <p className="px-1 text-micro normal-case text-app-muted">{t('usernameLockedHint')}</p>
            </div>
            <div className="relative">
              <Briefcase className="absolute start-3.5 top-3.5 w-4 h-4 text-app-muted" />
              <input
                type="text"
                aria-label={t('jobFieldAriaLabel')}
                placeholder={t('jobPlaceholder')}
                maxLength={120}
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className="w-full bg-input-app border border-app rounded-2xl ps-10 pe-4 py-2.5 text-body font-semibold text-app focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2" data-section="bio">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('bioSectionLabel')}</label>
            <textarea
              rows={3}
              placeholder={t('bioPlaceholder')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-input-app border border-app rounded-2xl p-3 text-body font-semibold text-app focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
            />
          </div>

          {/* Relationship goal */}
          <div className="space-y-2">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('lookingForLabel')}</label>
            <p className="text-micro normal-case text-app-muted">{t('relationshipGoalSelectionHint')}</p>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIP_GOALS.map((g) => (
                <FilterChip
                  key={g.value}
                  type="button"
                  selected={relationshipGoals.includes(g.value)}
                  onClick={() => toggleRelationshipGoal(g.value)}
                >
                  {g.label}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Lifestyle */}
          <div className="space-y-3" data-section="lifestyle">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('lifestyleSectionLabel')}</label>

            <div className="relative">
              <Ruler className="absolute start-3.5 top-3.5 w-4 h-4 text-app-muted" />
              <input
                type="number"
                inputMode="numeric"
                placeholder={t('heightPlaceholder')}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full bg-input-app border border-app rounded-2xl ps-10 pe-4 py-2.5 text-body font-semibold text-app focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
              />
            </div>

            <div className="space-y-1.5" data-section="zodiac">
              <span className="flex items-center gap-1.5 text-caption font-bold text-app-muted normal-case">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
                {t('zodiacSectionLabel')}
              </span>
              <div className="flex flex-wrap gap-2">
                {ZODIAC_OPTIONS.map((opt) => {
                  const selected = zodiac === opt.value;
                  return (
                    <FilterChip
                      key={opt.value}
                      type="button"
                      selected={selected}
                      onClick={() => setZodiac(selected ? '' : opt.value)}
                      className="inline-flex items-center gap-1.5"
                    >
                      <ZodiacIcon
                        sign={opt.value}
                        className={selected ? undefined : ZODIAC_ACCENT_CLASSES[opt.value as ZodiacSign]}
                      />
                      {opt.label}
                    </FilterChip>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5" data-section="smokingStatus">
              <span className="text-caption font-bold text-app-muted normal-case">{t('smokingSectionLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {SMOKING_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    type="button"
                    selected={smokingStatus === opt.value}
                    onClick={() => setSmokingStatus(smokingStatus === opt.value ? '' : opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="space-y-1.5" data-section="drinkingStatus">
              <span className="text-caption font-bold text-app-muted normal-case">{t('drinkingSectionLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {DRINKING_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    type="button"
                    selected={drinkingStatus === opt.value}
                    onClick={() => setDrinkingStatus(drinkingStatus === opt.value ? '' : opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-caption font-bold text-app-muted normal-case">{t('childrenStatusSectionLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {CHILDREN_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    type="button"
                    selected={childrenStatus === opt.value}
                    onClick={() => setChildrenStatus(childrenStatus === opt.value ? '' : opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-caption font-bold text-app-muted normal-case">{t('familyPlansSectionLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {FAMILY_PLAN_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    type="button"
                    selected={familyPlans === opt.value}
                    onClick={() => setFamilyPlans(familyPlans === opt.value ? '' : opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div data-section="languages">
              <LanguageSelector selected={languages} onChange={setLanguages} />
            </div>
          </div>

          {/* Interests — compact summary only; the full categorized catalog lives in the
              dedicated InterestsEditorScreen so this form doesn't grow to several screens tall. */}
          <div className="space-y-2" data-section="interests">
            <label className="text-micro font-extrabold text-app-muted uppercase">{t('interestsSectionLabel')}</label>
            <p className="text-micro normal-case text-app-muted">
              {t('interestsSelectedCountTemplate').replace('{count}', String(interests.length))}
            </p>
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {interests.slice(0, 6).map((item) => (
                  <Chip key={item}>{getLocalizedInterestLabel(item, locale)}</Chip>
                ))}
                {interests.length > 6 && <Chip>+{interests.length - 6}</Chip>}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsInterestsEditorOpen(true)}
              className="w-full flex items-center justify-between rounded-2xl border border-app bg-surface px-4 py-3.5 text-body font-bold text-app active:scale-[0.99] transition-transform"
            >
              <span>{t('editInterestsButton')}</span>
              <ChevronRight className="w-5 h-5 text-app-muted" />
            </button>
          </div>

          {/* Profil Sorularim -- saved through its own endpoints the moment each question is
              added/edited, so it never rides along with this form's submit (and an unsaved bio
              draft is never lost by opening it). */}
          <div className="space-y-2" data-section="profile-questions">
            <label className="text-micro font-extrabold text-app-muted uppercase">{qt('editorTitle')}</label>
            <p className="text-micro normal-case text-app-muted">
              {ownQuestions
                ? qt('countTemplate', { count: ownQuestions.activeQuestionCount, max: ownQuestions.maxQuestions })
                : qt('editorEntrySubtitle')}
            </p>
            <button
              type="button"
              onClick={() => setIsQuestionsEditorOpen(true)}
              className="w-full flex items-center justify-between rounded-2xl border border-app bg-surface px-4 py-3.5 text-body font-bold text-app active:scale-[0.99] transition-transform"
            >
              <span>{qt('editorTitle')}</span>
              <ChevronRight className="w-5 h-5 text-app-muted" />
            </button>
          </div>

          <ProfileCreativeEditor city={city} onCityChange={(next, id) => { setCity(next); setCityId(id); }} initialPrompts={user?.prompts} initialVoice={user?.voicePrompt} />

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <AppButton type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
            {t('saveChangesButton')}
          </AppButton>
        </form>
      </div>

      {cropSource && (
        <PhotoCropScreen
          imageSrc={cropSource}
          onConfirm={handleCropConfirm}
          onUseOriginal={handleUseOriginalPhoto}
          onCancel={handleCropCancel}
        />
      )}

      {isQuestionsEditorOpen && (
        <div className="fixed inset-0 z-modal flex flex-col bg-app text-app">
          <div className="pt-safe flex items-center gap-2 border-b border-app px-4 py-3">
            <button
              type="button"
              aria-label={t('backButtonLabel')}
              onClick={() => setIsQuestionsEditorOpen(false)}
              className="rounded-full p-1.5 text-app-muted active:scale-90 transition-transform"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </button>
            <h3 className="text-heading text-app">{qt('editorTitle')}</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-safe pt-4">
            <ProfileQuestionsManager />
          </div>
        </div>
      )}

      {isInterestsEditorOpen && (
        <InterestsEditorScreen
          initialSelected={interests}
          onCancel={() => setIsInterestsEditorOpen(false)}
          onSave={(next) => {
            setInterests(next);
            setIsInterestsEditorOpen(false);
          }}
        />
      )}
    </div>
  );
};

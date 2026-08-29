import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  Mail, Lock, User, AtSign, Calendar, Check, ChevronRight,
  Images, Plus, X, Camera as CameraIcon, Loader2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { apiClient } from '../../services/api/apiClient';
import { mediaService } from '../../services/media/mediaService';
import { nativeCamera } from '../../native/camera';
import { toast } from '../../stores/useToastStore';
import { AppButton } from '../../components/ui/AppButton';
import { ActionSheet } from '../../components/ui/ActionSheet';
import { PhotoCropScreen } from '../../components/ui/PhotoCropScreen';
import { RegistrationHeader } from './RegistrationHeader';
import { REGISTRATION_STEPS } from './registrationSteps';
import { SPRING, PRESS_SCALE } from '../../motion/tokens';
import { pageTransition } from '../../motion/variants';
import { getRelationshipGoalLabel } from '../../lib/profileLabels';
import { INTEREST_CATEGORIES, INTEREST_MIN, INTEREST_MAX } from '../../lib/interests';
import { nativeKeyboard } from '../../native/keyboard';
import { dismissKeyboardOnBackgroundPointerDown } from '../../hooks/useKeyboardViewport';
import { useAppTranslation } from '../../i18n/appLocale';

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;
const MIN_REGISTRATION_AGE = 18;
// Mirrors auth_controller.js's/user_controller.js's MIN_USER_AGE/MAX_USER_AGE server-side bound
// check exactly -- keep both in sync.
const MAX_REGISTRATION_AGE = 99;
// Mirrors auth_controller.js's passwordPolicyError() exactly -- client and server must agree
// or the user gets blocked here only to hit the same rule again (or a laxer one) at submit.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_FORMAT_REGEX = /^\S+@\S+\.\S+$/;

const BASIC_STEP_INDEX = REGISTRATION_STEPS.findIndex((s) => s.id === 'basic');
const USERNAME_STEP_INDEX = REGISTRATION_STEPS.findIndex((s) => s.id === 'username');
const BIRTHDATE_STEP_INDEX = REGISTRATION_STEPS.findIndex((s) => s.id === 'birthdate');

// Mirrors auth_controller.js's server-side computation exactly (same year/month/day logic) so
// the client's pre-submit check and the server's authoritative check never disagree.
function computeAge(birthDateStr: string): number | null {
  const dob = new Date(birthDateStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Native <input type="date"> min/max are a UX affordance only (some browsers/WebViews ignore
// them entirely) -- computeAge()'s check above is what's actually authoritative client-side, and
// the server re-validates regardless. Computed once at module load; a birthday picker doesn't
// need to react to the clock ticking over midnight mid-session.
function isoDateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
const minBirthDate = isoDateYearsAgo(MAX_REGISTRATION_AGE);
const maxBirthDate = isoDateYearsAgo(MIN_REGISTRATION_AGE);
// Canonical set + order of the five selectable relationship goals (see profileLabels.ts) --
// labels are resolved per the app's current locale so this list is never Turkish-only.
const RELATIONSHIP_GOAL_KEYS = ['LONG_TERM', 'SHORT_TERM', 'FRIENDSHIP', 'OPEN_TO_EXPLORING', 'NOT_SURE'] as const;

const inputClass =
  'w-full h-14 bg-input-app border border-app rounded-2xl ps-12 pe-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
interface DraftPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  uploadStatus: 'uploading' | 'uploaded' | 'failed';
  uploadToken?: string;
}

const SelectionCard: React.FC<{ label: string; selected: boolean; onSelect: () => void }> = ({
  label,
  selected,
  onSelect,
}) => (
  <motion.button
    type="button"
    whileTap={{ scale: PRESS_SCALE }}
    transition={SPRING.snappy}
    onClick={onSelect}
    className={`w-full h-14 px-5 rounded-2xl border text-start font-bold text-body flex items-center justify-between transition-colors ${
      selected ? 'border-pink-500 bg-pink-500/10 text-app shadow-soft' : 'border-app bg-surface text-app-muted'
    }`}
  >
    <span>{label}</span>
    {selected && <Check className="w-5 h-5 text-pink-500" />}
  </motion.button>
);

const PasswordRequirementRow: React.FC<{ met: boolean; label: string }> = ({ met, label }) => (
  <div className="flex items-center gap-1.5">
    {met ? (
      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
    ) : (
      <span className="w-3.5 h-3.5 rounded-full border border-app-muted shrink-0" />
    )}
    <span className={`text-micro normal-case font-medium ${met ? 'text-green-500' : 'text-app-muted'}`}>{label}</span>
  </div>
);

const Chip: React.FC<{ label: string; selected: boolean; onSelect: () => void; disabled?: boolean }> = ({
  label,
  selected,
  onSelect,
  disabled,
}) => (
  <motion.button
    type="button"
    whileTap={disabled ? undefined : { scale: PRESS_SCALE }}
    transition={SPRING.snappy}
    onClick={onSelect}
    disabled={disabled}
    className={`px-4 py-2 rounded-full text-caption font-bold border transition-colors disabled:opacity-40 ${
      selected ? 'bg-brand-gradient text-white border-transparent' : 'bg-surface text-app-muted border-app'
    }`}
  >
    {label}
  </motion.button>
);

interface RegistrationWizardProps {
  onExit: () => void;
  onComplete: () => void;
}

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({ onExit, onComplete }) => {
  const { t, locale } = useAppTranslation();
  const RELATIONSHIP_GOALS = RELATIONSHIP_GOAL_KEYS.map((value) => ({
    value,
    label: getRelationshipGoalLabel(value, locale) || value,
  }));

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [errorMsg, setErrorMsg] = useState('');

  // Basic
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailFieldError, setEmailFieldError] = useState('');
  // Debounced server-side availability check, mirroring the username step's own pattern below --
  // reports a duplicate email at this step instead of only after the user has completed every
  // remaining step and hit final submit. 'checking'/'idle' both count as "not yet confirmed
  // available" for canSubmitBasic, so a race between typing and the debounce can't let a
  // not-yet-verified address through.
  const [emailStatus, setEmailStatus] = useState<UsernameStatus>('idle');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameHint, setUsernameHint] = useState('');

  // Identity
  const [birthDate, setBirthDate] = useState('2000-01-01');
  const [birthDateError, setBirthDateError] = useState('');
  const [gender, setGender] = useState('FEMALE');
  const [targetGender, setTargetGender] = useState('MALE');
  const [relationshipGoal, setRelationshipGoal] = useState('OPEN_TO_EXPLORING');
  const [interests, setInterests] = useState<string[]>([]);

  // Photos keep local previews, but only server-confirmed temporary uploads count toward signup.
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const [cropQueue, setCropQueue] = useState<Blob[]>([]);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<DraftPhoto[]>(photos);

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);


  const [isSubmitting, setIsSubmitting] = useState(false);

  const register = useAuthStore((s) => s.register);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const goNext = () => {
    void nativeKeyboard.hide();
    setErrorMsg('');
    setDirection('forward');
    setStepIndex((s) => Math.min(REGISTRATION_STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    void nativeKeyboard.hide();
    setErrorMsg('');
    if (stepIndex === 0) {
      onExit();
      return;
    }
    setDirection('back');
    setStepIndex((s) => Math.max(0, s - 1));
  };

  // --- Email: debounced server-side availability check (format-valid, not a disallowed test
  // domain, not already registered) -- see GET /api/auth/email/check, which reuses the exact
  // same normalization/uniqueness query as POST /register's own final check. ---
  useEffect(() => {
    const trimmed = email.trim();
    if (!EMAIL_FORMAT_REGEX.test(trimmed)) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/api/auth/email/check?email=${encodeURIComponent(trimmed)}`, {
          skipAuth: true,
        });
        const data = res?.data;
        if (!data?.valid) {
          setEmailStatus('invalid');
          setEmailFieldError(data?.message || t('invalidEmailMessage'));
        } else if (data.available) {
          setEmailStatus('available');
          setEmailFieldError('');
        } else {
          setEmailStatus('taken');
          setEmailFieldError(data?.message || t('emailAlreadyInUseError'));
        }
      } catch {
        // Network/service hiccup -- don't block the user on a check we couldn't complete; the
        // authoritative final check at submit still catches a real duplicate either way.
        setEmailStatus('idle');
      }
    }, 450);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // --- Username: auto-suggest from email, debounced availability check on manual edits ---
  useEffect(() => {
    if (usernameEdited || !email.includes('@')) return;
    const handle = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/api/auth/username/suggest?email=${encodeURIComponent(email)}`, {
          skipAuth: true,
        });
        if (res?.data?.username) {
          setUsername(res.data.username);
          setUsernameStatus('available');
          setUsernameHint(t('usernameAvailableLabel'));
        }
      } catch {
        // Non-fatal — user can still type a username manually.
      }
    }, 450);
    return () => clearTimeout(handle);
    // `t` is intentionally omitted -- it's a new closure every render (see useAppTranslation),
    // and including it would reset this debounce timer on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, usernameEdited]);

  useEffect(() => {
    if (!usernameEdited) return;
    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/api/auth/username/check?username=${encodeURIComponent(username)}`, {
          skipAuth: true,
        });
        const data = res?.data;
        if (!data?.valid) {
          setUsernameStatus('invalid');
          // Never show data?.message directly -- the backend's validation reason is untranslated
          // prose (see the emailAlreadyInUseError / usernameTakenMessage fix above), so always use
          // the localized generic message here regardless of what the server sent.
          setUsernameHint(t('usernameInvalidMessage'));
        } else if (data.available) {
          setUsernameStatus('available');
          setUsernameHint(t('usernameAvailableLabel'));
        } else {
          setUsernameStatus('taken');
          setUsernameHint(
            data.suggestion
              ? t('usernameTakenSuggestionTemplate').replace('{suggestion}', data.suggestion)
              : t('usernameTakenMessage')
          );
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
    // `t` is intentionally omitted -- it's a new closure every render (see useAppTranslation),
    // and including it would reset this debounce timer on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, usernameEdited]);

  const trimmedEmail = email.trim();
  const isEmailFormatValid = EMAIL_FORMAT_REGEX.test(trimmedEmail);
  const showEmailFormatError = emailTouched && trimmedEmail.length > 0 && !isEmailFormatValid;

  const hasMinPasswordLength = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  const hasPasswordLetter = /[a-zA-Z]/.test(password);
  const hasPasswordDigit = /[0-9]/.test(password);
  const isPasswordValid = hasMinPasswordLength && hasPasswordLetter && hasPasswordDigit;

  const canSubmitBasic = name.trim().length > 0 && isEmailFormatValid && isPasswordValid && emailStatus === 'available';

  // Mirrors username_utils.js's USERNAME_MIN exactly -- client and server must agree or the
  // user gets blocked here only to hit the same rule (or a laxer one) again at submit.
  const canSubmitUsername = username.length >= 5 && usernameStatus === 'available';
  const uploadedPhotoCount = photos.filter((photo) => photo.uploadStatus === 'uploaded').length;

  // --- Interests ---
  const toggleInterest = (tag: string) => {
    setInterests((prev) => {
      if (prev.includes(tag)) return prev.filter((i) => i !== tag);
      if (prev.length >= INTEREST_MAX) return prev;
      return [...prev, tag];
    });
  };

  // --- Photos ---
  const isCancellation = (err: any) => /cancel/i.test(err?.message || '') || /cancel/i.test(err?.errorMessage || '');

  const handleAddPhotos = () => {
    if (photos.length >= MAX_PHOTOS) return;
    if (Capacitor.isNativePlatform()) {
      setIsPhotoSheetOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const enqueueForCrop = (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    setCropQueue((prev) => [...prev, ...blobs]);
    setCropSource((prev) => prev ?? URL.createObjectURL(blobs[0]));
  };

  const handleTakePhoto = async () => {
    try {
      const uri = await nativeCamera.takePhoto();
      if (!uri) return;
      const blob = await fetch(uri).then((r) => r.blob());
      enqueueForCrop([blob]);
    } catch (err: any) {
      if (!isCancellation(err)) toast.error(t('photoCaptureFailedMessage'));
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const uris = await nativeCamera.pickImages();
      const blobs: Blob[] = [];
      for (const uri of uris.slice(0, MAX_PHOTOS - photos.length)) {
        try {
          blobs.push(await fetch(uri).then((r) => r.blob()));
        } catch {
          toast.error(t('photoProcessFailedMessage'));
        }
      }
      enqueueForCrop(blobs);
    } catch (err: any) {
      if (!isCancellation(err)) toast.error(t('galleryAccessFailedMessage'));
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

  const uploadDraftPhoto = async (id: string, blob: Blob) => {
    setPhotos((current) => current.map((photo) => (
      photo.id === id ? { ...photo, uploadStatus: 'uploading', uploadToken: undefined } : photo
    )));
    try {
      const response = await mediaService.uploadRegistrationPhoto(blob);
      if (!response?.data?.uploadToken) throw new Error('Upload token missing');
      setPhotos((current) => current.map((photo) => (
        photo.id === id
          ? { ...photo, uploadStatus: 'uploaded', uploadToken: response.data.uploadToken }
          : photo
      )));
    } catch {
      setPhotos((current) => current.map((photo) => (
        photo.id === id ? { ...photo, uploadStatus: 'failed', uploadToken: undefined } : photo
      )));
    }
  };

  const addDraftPhoto = (blob: Blob) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPhotos((prev) => [...prev, {
      id,
      blob,
      previewUrl: URL.createObjectURL(blob),
      uploadStatus: 'uploading',
    }]);
    void uploadDraftPhoto(id, blob);
  };

  const handleCropConfirm = (croppedBlob: Blob) => {
    addDraftPhoto(croppedBlob);
    advanceCropQueue(cropQueue.slice(1));
  };

  const handleUseOriginalPhoto = () => {
    const originalBlob = cropQueue[0];
    if (!originalBlob) return;
    addDraftPhoto(originalBlob);
    advanceCropQueue(cropQueue.slice(1));
  };

  const handleCropCancel = () => advanceCropQueue(cropQueue.slice(1));

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // --- Final submit ---
  const handleCreateAccount = async () => {
    if (isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const photoUploadTokens = photos
        .map((photo) => photo.uploadToken)
        .filter((token): token is string => !!token);
      if (photoUploadTokens.length < MIN_PHOTOS) {
        throw new Error(t('minPhotosRequirementMessage'));
      }
      await register({
        email,
        password,
        name,
        username,
        birthDate,
        gender,
        targetGender,
        relationshipGoal,
        interests,
        photoUploadTokens,
        targetLang: locale,
      });
      await fetchMe();
      onComplete();
    } catch (err: any) {
      const message: string = err?.message || t('registrationFailedMessage');
      const code: string | undefined = err?.code;
      if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
        setErrorMsg(t('networkConnectionFailedMessage'));
      } else if (/e-posta adresi zaten kullanımda/i.test(message)) {
        // The backend replies with a Turkish prose message, not a stable error code -- this regex
        // only classifies *which* case it is; the text shown to the user always comes from t(),
        // never the raw backend string, so a non-Turkish app locale doesn't see Turkish here.
        setEmailFieldError(t('emailAlreadyInUseError'));
        setEmailTouched(true);
        setDirection('back');
        setStepIndex(BASIC_STEP_INDEX);
      } else if (/kullanıcı adı kullanılıyor/i.test(message)) {
        setUsernameStatus('taken');
        setUsernameHint(t('usernameTakenMessage'));
        setDirection('back');
        setStepIndex(USERNAME_STEP_INDEX);
      } else if (/18 yaşında/i.test(message)) {
        setBirthDateError(t('minAgeRequirementMessage'));
        setDirection('back');
        setStepIndex(BIRTHDATE_STEP_INDEX);
      } else {
        setErrorMsg(message);
      }
      setIsSubmitting(false);
    }
  };

  const step = REGISTRATION_STEPS[stepIndex];

  return (
    <div
      className="flex flex-col h-full min-h-0 w-full bg-app text-app relative overflow-hidden select-none"
      onPointerDown={dismissKeyboardOnBackgroundPointerDown}
    >
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

      <RegistrationHeader stepIndex={stepIndex} onBack={goBack} isFirstStep={stepIndex === 0} />

      {errorMsg && (
        <div className="mx-6 my-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center z-10">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            variants={pageTransition(direction)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="auth-keyboard-scroll absolute inset-0 flex flex-col justify-between p-6 z-10 overflow-y-auto no-scrollbar"
          >
            {/* BASIC: name, email, password */}
            {step.id === 'basic' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('createAccount')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('registrationBasicSubheading')}</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmitBasic) goNext();
                  }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <User className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="text"
                      name="name"
                      required
                      autoComplete="name"
                      enterKeyHint="next"
                      placeholder={t('namePlaceholder')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          emailInputRef.current?.focus();
                        }
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <div className="relative">
                      <Mail className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="email"
                        ref={emailInputRef}
                        name="email"
                        required
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="email"
                        enterKeyHint="next"
                        placeholder={t('emailAddressPlaceholder')}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value.trim());
                          if (emailFieldError) setEmailFieldError('');
                        }}
                        onBlur={() => setEmailTouched(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            setEmailTouched(true);
                            passwordInputRef.current?.focus();
                          }
                        }}
                        aria-invalid={showEmailFormatError || !!emailFieldError}
                        className={`${inputClass} pe-10 ${
                          showEmailFormatError || emailFieldError
                            ? 'border-red-500'
                            : emailStatus === 'available'
                              ? 'border-green-500'
                              : ''
                        }`}
                      />
                      {emailStatus === 'checking' && (
                        <Loader2 className="absolute end-4 top-4 w-5 h-5 text-app-muted animate-spin" />
                      )}
                      {emailStatus === 'available' && (
                        <Check className="absolute end-4 top-4 w-5 h-5 text-green-500" />
                      )}
                    </div>
                    {(showEmailFormatError || emailFieldError) && (
                      <p role="alert" className="text-micro mt-1.5 ms-1 normal-case font-medium text-red-500">
                        {emailFieldError || t('invalidEmailMessage')}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="relative">
                      <Lock className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="password"
                        ref={passwordInputRef}
                        name="password"
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        maxLength={PASSWORD_MAX_LENGTH}
                        autoComplete="new-password"
                        enterKeyHint="done"
                        placeholder={t('passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="mt-2 ms-1 flex flex-wrap gap-x-3 gap-y-1">
                      <PasswordRequirementRow
                        met={hasMinPasswordLength}
                        label={t('passwordMinLengthRequirementTemplate').replace('{count}', String(PASSWORD_MIN_LENGTH))}
                      />
                      <PasswordRequirementRow met={hasPasswordLetter} label={t('passwordLetterRequirement')} />
                      <PasswordRequirementRow met={hasPasswordDigit} label={t('passwordDigitRequirement')} />
                    </div>
                  </div>
                  <AppButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!canSubmitBasic}
                    rightIcon={<ChevronRight className="w-5 h-5" />}
                  >
                    {t('continueButton')}
                  </AppButton>
                </form>
              </div>
            )}

            {/* USERNAME */}
            {step.id === 'username' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('usernameStepHeading')}</h2>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmitUsername) goNext();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <div className="relative">
                      <AtSign className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="text"
                        name="username"
                        required
                        autoFocus
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="username"
                        enterKeyHint="next"
                        placeholder={t('usernamePlaceholder')}
                        value={username}
                        onChange={(e) => {
                          setUsernameEdited(true);
                          setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
                        }}
                        className={`${inputClass} pe-10 ${
                          usernameStatus === 'taken' || usernameStatus === 'invalid'
                            ? 'border-red-500'
                            : usernameStatus === 'available'
                              ? 'border-green-500'
                              : ''
                        }`}
                      />
                      {usernameStatus === 'checking' && (
                        <Loader2 className="absolute end-4 top-4 w-5 h-5 text-app-muted animate-spin" />
                      )}
                      {usernameStatus === 'available' && (
                        <Check className="absolute end-4 top-4 w-5 h-5 text-green-500" />
                      )}
                    </div>
                    {usernameHint && (
                      <p
                        className={`text-micro mt-1.5 ms-1 normal-case font-medium ${
                          usernameStatus === 'taken' || usernameStatus === 'invalid'
                            ? 'text-red-500'
                            : usernameStatus === 'available'
                              ? 'text-green-500'
                              : 'text-app-muted'
                        }`}
                      >
                        {usernameHint}
                      </p>
                    )}
                  </div>
                  <AppButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!canSubmitUsername}
                    rightIcon={<ChevronRight className="w-5 h-5" />}
                  >
                    {t('continueButton')}
                  </AppButton>
                </form>
              </div>
            )}

            {/* BIRTHDATE */}
            {step.id === 'birthdate' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('birthdateStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('birthdateStepSubheading')}</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!birthDate) return;
                    const age = computeAge(birthDate);
                    if (age === null || age < MIN_REGISTRATION_AGE || age > MAX_REGISTRATION_AGE) {
                      // Same message the server would otherwise return after a full submit --
                      // shown immediately, before the user gets to the end of the wizard.
                      const message = age !== null && age > MAX_REGISTRATION_AGE
                        ? t('maxAgeRequirementMessage')
                        : t('minAgeRequirementMessage');
                      setBirthDateError(message);
                      toast.error(message);
                      return;
                    }
                    setBirthDateError('');
                    goNext();
                  }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <Calendar className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="date"
                      name="birthdate"
                      required
                      autoComplete="bday"
                      enterKeyHint="next"
                      min={minBirthDate}
                      max={maxBirthDate}
                      value={birthDate}
                      onChange={(e) => {
                        setBirthDate(e.target.value);
                        if (birthDateError) setBirthDateError('');
                      }}
                      aria-invalid={!!birthDateError}
                      className={inputClass}
                    />
                  </div>
                  {birthDateError && (
                    <p role="alert" className="text-caption font-semibold text-[#FF4B55] normal-case">
                      {birthDateError}
                    </p>
                  )}
                  <AppButton type="submit" variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />}>
                    {t('continueButton')}
                  </AppButton>
                </form>
              </div>
            )}

            {/* GENDER */}
            {step.id === 'gender' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('genderStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('genderStepSubheading')}</p>
                </div>
                <div className="space-y-3">
                  {[
                    { value: 'FEMALE', label: t('genderOptionFemale') },
                    { value: 'MALE', label: t('genderOptionMale') },
                    { value: 'OTHER', label: t('genderOptionOther') },
                  ].map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={gender === opt.value} onSelect={() => setGender(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  {t('continueButton')}
                </AppButton>
              </div>
            )}

            {/* INTERESTED IN */}
            {step.id === 'interestedIn' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('interestedInStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('interestedInStepSubheading')}</p>
                </div>
                <div className="space-y-3">
                  {[
                    { value: 'FEMALE', label: t('interestedInOptionFemale') },
                    { value: 'MALE', label: t('interestedInOptionMale') },
                    { value: 'EVERYONE', label: t('interestedInOptionEveryone') },
                  ].map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={targetGender === opt.value} onSelect={() => setTargetGender(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  {t('continueButton')}
                </AppButton>
              </div>
            )}

            {/* RELATIONSHIP GOAL */}
            {step.id === 'relationshipGoal' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('relationshipGoalStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('relationshipGoalStepSubheading')}</p>
                </div>
                <div className="space-y-3">
                  {RELATIONSHIP_GOALS.map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={relationshipGoal === opt.value} onSelect={() => setRelationshipGoal(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  {t('continueButton')}
                </AppButton>
              </div>
            )}

            {/* INTERESTS */}
            {step.id === 'interests' && (
              // Unlike every other step, this one has enough content (8 categories of chips) to
              // routinely exceed the viewport -- with a plain document-flow layout the Continue
              // button sat at the very end of that content, so reaching the minimum selection
              // count never made it reachable without an extra scroll. Header and button are now
              // pinned outside the scrollable region (flex-1 min-h-0, the same idiom the wrapper
              // above uses) so the button is always on screen and enables the instant the
              // minimum is met, with no scrolling required to tap it.
              <div className="flex-1 min-h-0 flex flex-col max-w-sm mx-auto w-full">
                <div className="shrink-0">
                  <h2 className="text-title text-app">{t('interestsStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    {t('interestsCountTemplate')
                      .replace('{min}', String(INTEREST_MIN))
                      .replace('{max}', String(INTEREST_MAX))
                      .replace('{count}', String(interests.length))}
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-5 my-5">
                  {INTEREST_CATEGORIES.map((cat) => (
                    <div key={cat.id}>
                      <h3 className="text-micro font-bold text-app-muted uppercase tracking-wider mb-2">{cat.title}</h3>
                      <div className="flex flex-wrap gap-2">
                        {cat.interests.map((tag) => {
                          const selected = interests.includes(tag);
                          return (
                            <Chip
                              key={tag}
                              label={tag}
                              selected={selected}
                              disabled={!selected && interests.length >= INTEREST_MAX}
                              onSelect={() => toggleInterest(tag)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <AppButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  rightIcon={<ChevronRight className="w-5 h-5" />}
                  disabled={interests.length < INTEREST_MIN}
                  onClick={goNext}
                  className="shrink-0"
                >
                  {t('continueButton')}
                </AppButton>
              </div>
            )}

            {/* PHOTOS */}
            {step.id === 'photos' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">{t('photosStepHeading')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">{t('minPhotosRequirementMessage')}</p>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInputChange} />

                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-input-app border border-app">
                      {photo.uploadStatus === 'uploading' && (
                        <div className="absolute inset-0 z-10 grid place-items-center bg-black/45">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                      {photo.uploadStatus === 'failed' && (
                        <button
                          type="button"
                          onClick={() => void uploadDraftPhoto(photo.id, photo.blob)}
                          className="absolute inset-x-2 bottom-2 z-10 rounded-xl bg-black/70 px-2 py-1.5 text-micro font-bold text-white"
                        >
                          {t('retryUploadButton')}
                        </button>
                      )}
                      <img src={photo.previewUrl} alt={t('profilePhotoAlt')} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1.5 end-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center before:absolute before:-inset-2 before:content-['']"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {photos.length < MAX_PHOTOS && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: PRESS_SCALE }}
                      transition={SPRING.snappy}
                      onClick={handleAddPhotos}
                      className="aspect-[3/4] rounded-2xl border-2 border-dashed border-app bg-surface flex flex-col items-center justify-center gap-1.5 text-app-muted"
                    >
                      <CameraIcon className="w-5 h-5" />
                      <Plus className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </div>

                <p className={`text-micro normal-case ${uploadedPhotoCount >= MIN_PHOTOS ? 'text-[#32D583]' : 'text-app-muted'}`}>
                  {t('photosUploadedCountTemplate').replace('{count}', String(uploadedPhotoCount)).replace('{min}', String(MIN_PHOTOS))}
                </p>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} disabled={uploadedPhotoCount < MIN_PHOTOS} loading={isSubmitting} onClick={handleCreateAccount}>
                  {isSubmitting ? t('creatingAccountLabel') : t('continueButton')}
                </AppButton>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ActionSheet
        isOpen={isPhotoSheetOpen}
        onClose={() => setIsPhotoSheetOpen(false)}
        title={t('addPhotoSheetTitle')}
        actions={[
          { label: t('takePhotoAction'), icon: <CameraIcon className="w-4 h-4" />, onSelect: handleTakePhoto },
          { label: t('pickFromGalleryAction'), icon: <Images className="w-4 h-4" />, onSelect: handlePickFromGallery },
        ]}
      />

      {cropSource && (
        <PhotoCropScreen
          imageSrc={cropSource}
          onConfirm={handleCropConfirm}
          onUseOriginal={handleUseOriginalPhoto}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
};

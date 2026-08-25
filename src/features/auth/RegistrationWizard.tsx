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
import { RELATIONSHIP_GOAL_LABELS } from '../../lib/profileLabels';
import { INTEREST_CATEGORIES, INTEREST_MIN, INTEREST_MAX } from '../../lib/interests';
import { nativeKeyboard } from '../../native/keyboard';
import { dismissKeyboardOnBackgroundPointerDown } from '../../hooks/useKeyboardViewport';

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;
const MIN_REGISTRATION_AGE = 18;

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
const RELATIONSHIP_GOALS = Object.entries(RELATIONSHIP_GOAL_LABELS).map(([value, label]) => ({ value, label }));

const inputClass =
  'w-full h-14 bg-input-app border border-app rounded-2xl pl-12 pr-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

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
    className={`w-full h-14 px-5 rounded-2xl border text-left font-bold text-body flex items-center justify-between transition-colors ${
      selected ? 'border-pink-500 bg-pink-500/10 text-app shadow-soft' : 'border-app bg-surface text-app-muted'
    }`}
  >
    <span>{label}</span>
    {selected && <Check className="w-5 h-5 text-pink-500" />}
  </motion.button>
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
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [errorMsg, setErrorMsg] = useState('');

  // Basic
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
          setUsernameHint('Kullanılabilir');
        }
      } catch {
        // Non-fatal — user can still type a username manually.
      }
    }, 450);
    return () => clearTimeout(handle);
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
          setUsernameHint(data?.message || 'Geçersiz kullanıcı adı.');
        } else if (data.available) {
          setUsernameStatus('available');
          setUsernameHint('Kullanılabilir');
        } else {
          setUsernameStatus('taken');
          setUsernameHint(data.suggestion ? `Alınmış. Önerilen: ${data.suggestion}` : 'Bu kullanıcı adı kullanılıyor');
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [username, usernameEdited]);

  const canSubmitBasic =
    name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email) && password.length >= 8 && password.length <= 128;

  const canSubmitUsername = username.length >= 3 && usernameStatus === 'available';
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
      if (!isCancellation(err)) toast.error('Fotoğraf çekilemedi. Kamera izni verildiğinden emin ol.');
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
          toast.error('Fotoğraf işlenemedi.');
        }
      }
      enqueueForCrop(blobs);
    } catch (err: any) {
      if (!isCancellation(err)) toast.error('Galeriye erişilemedi. Fotoğraf izni verildiğinden emin ol.');
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
        throw new Error('Devam etmek için en az 2 profil fotoğrafı eklemelisin.');
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
      });
      await fetchMe();
      onComplete();
    } catch (err: any) {
      setErrorMsg(err.message || 'Kayıt tamamlanamadı.');
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
                  <h2 className="text-title text-app">Hesap Oluştur</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Profilini oluşturmak için başla.</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmitBasic) goNext();
                  }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <User className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="text"
                      name="name"
                      required
                      autoComplete="name"
                      enterKeyHint="next"
                      placeholder="İsmin"
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
                  <div className="relative">
                    <Mail className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
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
                      placeholder="E-posta Adresi"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          passwordInputRef.current?.focus();
                        }
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="password"
                      ref={passwordInputRef}
                      name="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      enterKeyHint="done"
                      placeholder="Şifre"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <AppButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!canSubmitBasic}
                    rightIcon={<ChevronRight className="w-5 h-5" />}
                  >
                    Devam Et
                  </AppButton>
                </form>
              </div>
            )}

            {/* USERNAME */}
            {step.id === 'username' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Kullanıcı Adın</h2>
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
                      <AtSign className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
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
                        placeholder="Kullanıcı Adı"
                        value={username}
                        onChange={(e) => {
                          setUsernameEdited(true);
                          setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
                        }}
                        className={`${inputClass} pr-10 ${
                          usernameStatus === 'taken' || usernameStatus === 'invalid'
                            ? 'border-red-500'
                            : usernameStatus === 'available'
                              ? 'border-green-500'
                              : ''
                        }`}
                      />
                      {usernameStatus === 'checking' && (
                        <Loader2 className="absolute right-4 top-4 w-5 h-5 text-app-muted animate-spin" />
                      )}
                      {usernameStatus === 'available' && (
                        <Check className="absolute right-4 top-4 w-5 h-5 text-green-500" />
                      )}
                    </div>
                    {usernameHint && (
                      <p
                        className={`text-micro mt-1.5 ml-1 normal-case font-medium ${
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
                    Devam Et
                  </AppButton>
                </form>
              </div>
            )}

            {/* BIRTHDATE */}
            {step.id === 'birthdate' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Doğum Tarihin</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Yaşın profilinde gösterilecek.</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!birthDate) return;
                    const age = computeAge(birthDate);
                    if (age === null || age < MIN_REGISTRATION_AGE) {
                      // Same message the server would otherwise return after a full submit --
                      // shown immediately, before the user gets to the end of the wizard.
                      const message = 'Kayıt olmak için en az 18 yaşında olmalısınız.';
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
                    <Calendar className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="date"
                      name="birthdate"
                      required
                      autoComplete="bday"
                      enterKeyHint="next"
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
                    Devam Et
                  </AppButton>
                </form>
              </div>
            )}

            {/* GENDER */}
            {step.id === 'gender' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Cinsiyetin</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Seni en iyi tanımlayan seçeneği belirle.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { value: 'FEMALE', label: 'Kadın' },
                    { value: 'MALE', label: 'Erkek' },
                    { value: 'OTHER', label: 'Diğer / Belirtmek İstemiyorum' },
                  ].map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={gender === opt.value} onSelect={() => setGender(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  Devam Et
                </AppButton>
              </div>
            )}

            {/* INTERESTED IN */}
            {step.id === 'interestedIn' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Kimi Arıyorsun?</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Keşfet akışını tercihlerine göre şekillendireceğiz.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { value: 'FEMALE', label: 'Kadınlar' },
                    { value: 'MALE', label: 'Erkekler' },
                    { value: 'EVERYONE', label: 'Herkes' },
                  ].map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={targetGender === opt.value} onSelect={() => setTargetGender(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  Devam Et
                </AppButton>
              </div>
            )}

            {/* RELATIONSHIP GOAL */}
            {step.id === 'relationshipGoal' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">İlişki Hedefin</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Ne tür bir ilişki aradığını belirt.</p>
                </div>
                <div className="space-y-3">
                  {RELATIONSHIP_GOALS.map((opt) => (
                    <SelectionCard key={opt.value} label={opt.label} selected={relationshipGoal === opt.value} onSelect={() => setRelationshipGoal(opt.value)} />
                  ))}
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  Devam Et
                </AppButton>
              </div>
            )}

            {/* INTERESTS */}
            {step.id === 'interests' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">İlgi Alanların</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    {INTEREST_MIN}–{INTEREST_MAX} ilgi alanı seç · {interests.length} seçili
                  </p>
                </div>
                <div className="space-y-5">
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
                >
                  Devam Et
                </AppButton>
              </div>
            )}

            {/* PHOTOS */}
            {step.id === 'photos' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Fotoğraflarını Ekle</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">Devam etmek için en az 2 profil fotoğrafı eklemelisin.</p>
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
                          Tekrar Yükle
                        </button>
                      )}
                      <img src={photo.previewUrl} alt="Profil fotoğrafı" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
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
                  {uploadedPhotoCount}/{MIN_PHOTOS} fotoğraf yüklendi
                </p>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} disabled={uploadedPhotoCount < MIN_PHOTOS} loading={isSubmitting} onClick={handleCreateAccount}>
                  {isSubmitting ? 'Hesabın oluşturuluyor...' : 'Devam Et'}
                </AppButton>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ActionSheet
        isOpen={isPhotoSheetOpen}
        onClose={() => setIsPhotoSheetOpen(false)}
        title="Fotoğraf Ekle"
        actions={[
          { label: 'Fotoğraf Çek', icon: <CameraIcon className="w-4 h-4" />, onSelect: handleTakePhoto },
          { label: 'Kütüphaneden Seç', icon: <Images className="w-4 h-4" />, onSelect: handlePickFromGallery },
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

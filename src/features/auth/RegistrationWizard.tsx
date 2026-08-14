import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  Mail, Lock, User, AtSign, Calendar, Check, ChevronRight, MapPin,
  Images, Plus, X, Camera as CameraIcon, Loader2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { apiClient } from '../../services/api/apiClient';
import { mediaService, normalizeMediaUrl } from '../../services/media/mediaService';
import { nativeCamera } from '../../native/camera';
import { nativeLocation } from '../../native/location';
import { nativeAppSettings } from '../../native/nativeSettings';
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

const MAX_PHOTOS = 6;
const RELATIONSHIP_GOALS = Object.entries(RELATIONSHIP_GOAL_LABELS).map(([value, label]) => ({ value, label }));

const inputClass =
  'w-full h-14 bg-input-app border border-app rounded-2xl pl-12 pr-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
type LocationStatus = 'idle' | 'requesting' | 'resolving' | 'granted' | 'denied' | 'permanently_denied' | 'error';

interface DraftPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
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
  const [gender, setGender] = useState('FEMALE');
  const [targetGender, setTargetGender] = useState('MALE');
  const [relationshipGoal, setRelationshipGoal] = useState('OPEN_TO_EXPLORING');
  const [interests, setInterests] = useState<string[]>([]);

  // Photos (kept as local blobs — uploaded only after the account actually exists)
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const [cropQueue, setCropQueue] = useState<Blob[]>([]);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [district, setDistrict] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const deniedOnceRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const register = useAuthStore((s) => s.register);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const goNext = () => {
    setErrorMsg('');
    setDirection('forward');
    setStepIndex((s) => Math.min(REGISTRATION_STEPS.length - 1, s + 1));
  };

  const goBack = () => {
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
    name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email) && password.length >= 6;

  const canSubmitUsername =
    username.length >= 3 && usernameStatus !== 'taken' && usernameStatus !== 'invalid' && usernameStatus !== 'checking';

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

  const handleCropConfirm = (croppedBlob: Blob) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPhotos((prev) => [...prev, { id, blob: croppedBlob, previewUrl: URL.createObjectURL(croppedBlob) }]);
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

  // --- Location ---
  const requestLocation = async () => {
    setErrorMsg('');
    setLocationStatus('requesting');
    try {
      let permissionState: string = 'granted';
      if (Capacitor.isNativePlatform()) {
        const current = await Geolocation.checkPermissions();
        permissionState = current.location;
        if (permissionState !== 'granted') {
          const requested = await Geolocation.requestPermissions();
          permissionState = requested.location;
        }
      }

      if (permissionState !== 'granted') {
        if (deniedOnceRef.current) {
          setLocationStatus('permanently_denied');
        } else {
          deniedOnceRef.current = true;
          setLocationStatus('denied');
        }
        return;
      }

      setLocationStatus('resolving');
      const position: any = await nativeLocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000,
      });
      const lat = position?.coords?.latitude;
      const lng = position?.coords?.longitude;
      if (lat == null || lng == null) throw new Error('no coords');
      setCoords({ lat, lng });

      const geo = await apiClient.post('/api/geo/reverse', { latitude: lat, longitude: lng }, { skipAuth: true });
      setDistrict(geo?.data?.district || null);
      setProvince(geo?.data?.province || null);
      setLocationStatus('granted');
    } catch {
      setLocationStatus('error');
    }
  };

  // --- Final submit ---
  const handleCreateAccount = async () => {
    if (isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const cityLabel = district && province ? `${district}, ${province}` : province || undefined;

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
        city: cityLabel,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });

      // Account now exists and the session is authenticated — upload queued photos right
      // after, before entering the main app. Bio, languages, and smoking/drinking preferences
      // are no longer collected here; they're filled in later from the Profile screen.
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        try {
          const res = await mediaService.uploadMedia(photo.blob, 'profile');
          if (res?.data?.url) uploadedUrls.push(res.data.url);
        } catch {
          // A single failed photo shouldn't block entering the app with a real account.
        }
      }

      if (uploadedUrls.length > 0) {
        // The account already exists by this point (register() above succeeded) -- a failure
        // here (most notably the face-photo gate rejecting every uploaded photo) must not be
        // swallowed silently, or the user lands in the app with no saved photos and no idea
        // why. It also isn't fatal to onboarding completion: the account is real either way,
        // so this surfaces a toast and lets the user continue rather than blocking entry.
        await apiClient.put('/api/profile', { photos: uploadedUrls }, { timeoutMs: 45000 }).catch((err: any) => {
          toast.error(err?.message || 'Fotoğrafların kaydedilemedi. Profilinden tekrar deneyebilirsin.');
        });
      }

      await fetchMe().catch(() => {});
      onComplete();
    } catch (err: any) {
      setErrorMsg(err.message || 'Kayıt tamamlanamadı.');
      setIsSubmitting(false);
    }
  };

  const step = REGISTRATION_STEPS[stepIndex];

  return (
    <div className="flex flex-col h-full w-full bg-app text-app relative overflow-hidden select-none">
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

      <RegistrationHeader stepIndex={stepIndex} onBack={goBack} isFirstStep={stepIndex === 0} />

      {errorMsg && (
        <div className="mx-6 my-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center z-10">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            variants={pageTransition(direction)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex flex-col justify-between p-6 z-10 overflow-y-auto no-scrollbar"
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
                      required
                      placeholder="İsmin"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="email"
                      required
                      placeholder="E-posta Adresi"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      className={inputClass}
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="password"
                      required
                      minLength={6}
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
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    E-postandan önerdik, istersen değiştirebilirsin.
                  </p>
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
                        required
                        autoFocus
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
                <div className="relative">
                  <Calendar className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} onClick={goNext}>
                  Devam Et
                </AppButton>
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
                  <p className="text-caption text-app-muted mt-1 normal-case">En az bir fotoğraf ekleyerek profilini tamamla.</p>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInputChange} />

                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-input-app border border-app">
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

                <AppButton variant="primary" size="lg" fullWidth rightIcon={<ChevronRight className="w-5 h-5" />} disabled={photos.length === 0} onClick={goNext}>
                  Devam Et
                </AppButton>
              </div>
            )}

            {/* LOCATION */}
            {step.id === 'location' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Neredesin?</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    Yakınındaki kişileri gösterebilmemiz için konumuna ihtiyacımız var.
                  </p>
                </div>

                {locationStatus === 'granted' && district && province ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl border border-app bg-surface">
                    <MapPin className="w-5 h-5 text-pink-500 shrink-0" />
                    <p className="text-body font-bold text-app">{district}, {province}</p>
                  </div>
                ) : locationStatus === 'granted' && province ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl border border-app bg-surface">
                    <MapPin className="w-5 h-5 text-pink-500 shrink-0" />
                    <p className="text-body font-bold text-app">{province}</p>
                  </div>
                ) : locationStatus === 'requesting' || locationStatus === 'resolving' ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl border border-app bg-surface">
                    <Loader2 className="w-5 h-5 text-app-muted animate-spin shrink-0" />
                    <p className="text-body font-semibold text-app-muted">Konumun belirleniyor...</p>
                  </div>
                ) : locationStatus === 'denied' ? (
                  <div className="space-y-3">
                    <p className="text-caption text-red-500 font-semibold normal-case">
                      Konum izni verilmedi. Yakınındaki kişileri gösterebilmemiz için gerekli.
                    </p>
                    <AppButton variant="secondary" size="lg" fullWidth onClick={requestLocation}>
                      Tekrar İzin Ver
                    </AppButton>
                  </div>
                ) : locationStatus === 'permanently_denied' ? (
                  <div className="space-y-3">
                    <p className="text-caption text-red-500 font-semibold normal-case">
                      Konum izni kapalı. Ayarlardan izin vermen gerekiyor.
                    </p>
                    <AppButton variant="secondary" size="lg" fullWidth onClick={() => nativeAppSettings.open()}>
                      Ayarları Aç
                    </AppButton>
                  </div>
                ) : locationStatus === 'error' ? (
                  <div className="space-y-3">
                    <p className="text-caption text-red-500 font-semibold normal-case">Konumun belirlenemedi.</p>
                    <AppButton variant="secondary" size="lg" fullWidth onClick={requestLocation}>
                      Tekrar Dene
                    </AppButton>
                  </div>
                ) : (
                  <AppButton variant="primary" size="lg" fullWidth onClick={requestLocation}>
                    Konumumu Kullan
                  </AppButton>
                )}

                <AppButton
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={locationStatus !== 'granted'}
                  loading={isSubmitting}
                  onClick={handleCreateAccount}
                >
                  {isSubmitting ? 'Hesabın oluşturuluyor...' : 'Hesabı Oluştur'}
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

      {cropSource && <PhotoCropScreen imageSrc={cropSource} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />}
    </div>
  );
};

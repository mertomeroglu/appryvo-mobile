import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CameraIcon, MapPin, Plus, Ruler, User, X } from 'lucide-react';
import { apiClient } from '../services/api/apiClient';
import { mediaService, normalizeMediaUrl, getPhotoUrl } from '../services/media/mediaService';
import { nativeCamera } from '../native/camera';
import { useAuthStore } from '../stores/useAuthStore';
import { toast } from '../stores/useToastStore';
import { AppButton } from './ui/AppButton';
import { IconButton } from './ui/IconButton';
import { FilterChip } from './ui/Chip';
import { PhotoCropScreen } from './ui/PhotoCropScreen';
import { LanguageSelector } from './LanguageSelector';
import {
  RELATIONSHIP_GOAL_LABELS,
  SMOKING_LABELS,
  DRINKING_LABELS,
  CHILDREN_STATUS_LABELS,
  FAMILY_PLANS_LABELS,
} from '../lib/profileLabels';

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
  languages: 'lifestyle',
  lifestyle: 'lifestyle',
};

const RELATIONSHIP_GOALS = Object.entries(RELATIONSHIP_GOAL_LABELS).map(([value, label]) => ({ value, label }));
const SMOKING_OPTIONS = Object.entries(SMOKING_LABELS).map(([value, label]) => ({ value, label }));
const DRINKING_OPTIONS = Object.entries(DRINKING_LABELS).map(([value, label]) => ({ value, label }));
const CHILDREN_OPTIONS = Object.entries(CHILDREN_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const FAMILY_PLAN_OPTIONS = Object.entries(FAMILY_PLANS_LABELS).map(([value, label]) => ({ value, label }));

const MAX_PHOTOS = 6;

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
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const [photos, setPhotos] = useState<PhotoSlot[]>(() => normalizeInitialPhotos(user?.photos));
  const [name, setName] = useState(user?.name || '');
  const [city, setCity] = useState(user?.city || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [relationshipGoal, setRelationshipGoal] = useState(user?.relationshipGoal || '');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [heightCm, setHeightCm] = useState(user?.heightCm ? String(user.heightCm) : '');
  const [smokingStatus, setSmokingStatus] = useState(user?.smokingStatus || '');
  const [drinkingStatus, setDrinkingStatus] = useState(user?.drinkingStatus || '');
  const [childrenStatus, setChildrenStatus] = useState(user?.childrenStatus || '');
  const [familyPlans, setFamilyPlans] = useState(user?.familyPlans || '');
  const [languages, setLanguages] = useState<string[]>(user?.languages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cropQueue, setCropQueue] = useState<Blob[]>([]);
  const [cropSource, setCropSource] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  if (!isOpen) return null;

  const handleAddInterest = () => {
    const value = newInterest.trim();
    if (value && !interests.includes(value)) {
      setInterests([...interests, value]);
    }
    setNewInterest('');
  };

  const handleRemoveInterest = (item: string) => {
    setInterests(interests.filter((i) => i !== item));
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
      toast.error('Fotoğraf yüklenemedi.');
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
          toast.error('Fotoğraf işlenemedi.');
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

  const handleCropCancel = () => {
    advanceCropQueue(cropQueue.slice(1));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    try {
      const parsedHeight = heightCm.trim() ? Number.parseInt(heightCm, 10) : undefined;
      await apiClient.put('/api/profile', {
        name,
        bio,
        city,
        interests,
        relationshipGoal: relationshipGoal || undefined,
        heightCm: Number.isFinite(parsedHeight) ? parsedHeight : undefined,
        smokingStatus: smokingStatus || undefined,
        drinkingStatus: drinkingStatus || undefined,
        childrenStatus: childrenStatus || undefined,
        familyPlans: familyPlans || undefined,
        languages,
        photos: photos.filter((p) => p.url).map((p) => p.url),
      }, { timeoutMs: 45000 }); // server re-runs face verification when the photo set changed
      await fetchMe();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Profil kaydedilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
      <div className="w-full max-w-md bg-surface border border-app rounded-none sm:rounded-3xl h-[100dvh] sm:h-auto sm:max-h-[85vh] overflow-hidden shadow-floating flex flex-col text-app select-none">
        {/* Header */}
        <header className="pt-safe px-5 py-4 border-b border-app bg-surface flex items-center justify-between z-sticky">
          <h3 className="text-heading text-app">Profili Düzenle</h3>
          <IconButton aria-label="Kapat" variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </IconButton>
        </header>

        {/* Scrollable Form Body */}
        <form ref={formRef} onSubmit={handleSave} className="p-5 space-y-6 flex-1 overflow-y-auto no-scrollbar">
          {/* Photos — first, per the design system's mobile edit-flow order */}
          <div className="space-y-2" data-section="photos">
            <label className="text-micro font-extrabold text-app-muted uppercase">Fotoğraflar</label>
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
                        alt="Profil fotoğrafı"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
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
            <label className="text-micro font-extrabold text-app-muted uppercase">Temel Bilgiler</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-app-muted" />
              <input
                type="text"
                placeholder="İsmin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-input-app border border-app rounded-2xl pl-10 pr-4 py-2.5 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-app-muted" />
              <input
                type="text"
                placeholder="Şehir"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-input-app border border-app rounded-2xl pl-10 pr-4 py-2.5 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2" data-section="bio">
            <label className="text-micro font-extrabold text-app-muted uppercase">Hakkımda</label>
            <textarea
              rows={3}
              placeholder="Kendini tanıtan kısa bir biyografi yaz..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-input-app border border-app rounded-2xl p-3 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
            />
          </div>

          {/* Relationship goal */}
          <div className="space-y-2">
            <label className="text-micro font-extrabold text-app-muted uppercase">Aradığın</label>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIP_GOALS.map((g) => (
                <FilterChip
                  key={g.value}
                  type="button"
                  selected={relationshipGoal === g.value}
                  onClick={() => setRelationshipGoal(relationshipGoal === g.value ? '' : g.value)}
                >
                  {g.label}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Lifestyle */}
          <div className="space-y-3" data-section="lifestyle">
            <label className="text-micro font-extrabold text-app-muted uppercase">Yaşam Tarzı</label>

            <div className="relative">
              <Ruler className="absolute left-3.5 top-3.5 w-4 h-4 text-app-muted" />
              <input
                type="number"
                inputMode="numeric"
                min={120}
                max={230}
                placeholder="Boy (cm)"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full bg-input-app border border-app rounded-2xl pl-10 pr-4 py-2.5 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-caption font-bold text-app-muted normal-case">Sigara</span>
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

            <div className="space-y-1.5">
              <span className="text-caption font-bold text-app-muted normal-case">Alkol</span>
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
              <span className="text-caption font-bold text-app-muted normal-case">Çocuk Durumu</span>
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
              <span className="text-caption font-bold text-app-muted normal-case">Çocuk İsteği</span>
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

            <LanguageSelector selected={languages} onChange={setLanguages} />
          </div>

          {/* Interests */}
          <div className="space-y-2" data-section="interests">
            <label className="text-micro font-extrabold text-app-muted uppercase">İlgi Alanları</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Yeni ilgi alanı..."
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInterest();
                  }
                }}
                className="flex-1 bg-input-app border border-app rounded-xl px-3 py-2 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
              />
              <AppButton type="button" variant="secondary" size="sm" onClick={handleAddInterest}>
                Ekle
              </AppButton>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {interests.map((item, idx) => (
                <span
                  key={idx}
                  className="text-caption px-3 py-1 rounded-full bg-surface-elevated border border-app text-app font-medium flex items-center gap-1.5"
                >
                  {item}
                  <button type="button" onClick={() => handleRemoveInterest(item)} className="text-app-muted hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <AppButton type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
            Değişiklikleri Kaydet
          </AppButton>
        </form>
      </div>

      {cropSource && (
        <PhotoCropScreen imageSrc={cropSource} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}
    </div>
  );
};

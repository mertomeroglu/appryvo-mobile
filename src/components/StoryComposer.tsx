import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CameraIcon, Image as ImageIcon, X } from 'lucide-react';
import { useCreateStoryMutation } from '../hooks/useQueries';
import { mediaService } from '../services/media/mediaService';
import { nativeCamera } from '../native/camera';
import { toast } from '../stores/useToastStore';
import { ActionSheet, type ActionSheetAction } from './ui/ActionSheet';
import { PhotoCropScreen } from './ui/PhotoCropScreen';
import { AppButton } from './ui/AppButton';
import { useAppTranslation } from '../i18n/appLocale';

const STORY_ASPECT = 9 / 16;

interface StoryComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished: () => void;
}

/** Image-only story creation (per product scope: "at minimum image must work"). Picker -> crop
 * preview -> caption -> upload -> POST /stories, reusing the exact camera/gallery/crop/upload
 * primitives EditProfileModal already uses for profile photos. */
export const StoryComposer: React.FC<StoryComposerProps> = ({ isOpen, onClose, onPublished }) => {
  const { t } = useAppTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativePickerLaunchingRef = useRef(false);
  const createStory = useCreateStoryMutation();

  useEffect(() => {
    if (isOpen) setPickerOpen(true);
  }, [isOpen]);

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setPickerOpen(false);
    if (cropSource) URL.revokeObjectURL(cropSource);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCropSource(null);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setCaption('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const openFromCamera = async () => {
    if (Capacitor.isNativePlatform()) {
      nativePickerLaunchingRef.current = true;
      try {
        const uri = await nativeCamera.takePhoto();
        if (!uri) return handleClose();
        const blob = await fetch(uri).then((r) => r.blob()).catch(() => null);
        if (blob) setCropSource(URL.createObjectURL(blob));
        else handleClose();
      } finally {
        nativePickerLaunchingRef.current = false;
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const openFromGallery = async () => {
    if (Capacitor.isNativePlatform()) {
      nativePickerLaunchingRef.current = true;
      try {
        const uris = await nativeCamera.pickImages();
        if (!uris[0]) return handleClose();
        const blob = await fetch(uris[0]).then((r) => r.blob()).catch(() => null);
        if (blob) setCropSource(URL.createObjectURL(blob));
        else handleClose();
      } finally {
        nativePickerLaunchingRef.current = false;
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const closePicker = () => {
    // ActionSheet closes synchronously after invoking an action. Keep the
    // composer mounted while the native activity is returning its media URI.
    if (nativePickerLaunchingRef.current) {
      setPickerOpen(false);
      return;
    }
    handleClose();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropSource(URL.createObjectURL(file));
    else handleClose();
  };

  const handleCropConfirm = (blob: Blob) => {
    setPreviewBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setCropSource(null);
  };

  const publish = async () => {
    if (!previewBlob || isUploading) return;
    setIsUploading(true);
    setError('');
    try {
      const uploadRes = await mediaService.uploadMedia(previewBlob, 'social');
      const mediaUrl = uploadRes?.data?.url;
      if (!mediaUrl) throw new Error(t('mediaUploadFailedMessage'));
      await createStory.mutateAsync({ mediaUrl, caption: caption.trim() || undefined });
      toast.success(t('storyPublishedToast'));
      reset();
      onPublished();
    } catch (err: any) {
      setError(err?.message || t('storyPublishFailedMessage'));
    } finally {
      setIsUploading(false);
    }
  };

  const pickerActions: ActionSheetAction[] = [
    { label: t('cameraLabel'), icon: <CameraIcon className="w-4 h-4" />, onSelect: openFromCamera },
    { label: t('galleryLabel'), icon: <ImageIcon className="w-4 h-4" />, onSelect: openFromGallery },
  ];

  if (!isOpen) return null;

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInputChange} />

      <ActionSheet isOpen={pickerOpen && !cropSource && !previewUrl} onClose={closePicker} title={t('storyAddLabel')} actions={pickerActions} />

      {cropSource && (
        <PhotoCropScreen imageSrc={cropSource} aspect={STORY_ASPECT} onConfirm={handleCropConfirm} onCancel={handleClose} />
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-modal bg-black flex flex-col select-none">
          <div className="pt-safe px-4 pb-3 flex items-center justify-between">
            <button type="button" aria-label={t('discardAriaLabel')} onClick={handleClose} className="text-white p-2 -ms-2">
              <X className="w-6 h-6" />
            </button>
            <span className="text-body font-bold text-white">{t('storyPreviewLabel')}</span>
            <span className="w-10" />
          </div>

          <div className="flex-1 relative overflow-hidden">
            <img src={previewUrl} alt={t('storyPreviewLabel')} className="absolute inset-0 w-full h-full object-contain" />
          </div>

          {error && <p className="px-4 pb-2 text-caption font-semibold text-red-400 text-center">{error}</p>}
          <div className="flex items-center gap-2.5 px-4 pb-safe pt-3">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 220))}
              placeholder={t('captionOptionalPlaceholder')}
              className="h-11 min-w-0 flex-1 rounded-full bg-white/10 border border-white/15 px-4 text-caption text-white placeholder:text-white/50 focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/60"
            />
            <AppButton type="button" variant="primary" size="md" loading={isUploading} onClick={publish} className="shrink-0 px-5">
              {t('shareLabel')}
            </AppButton>
          </div>
        </div>
      )}
    </>
  );
};

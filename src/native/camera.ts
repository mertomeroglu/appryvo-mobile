import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { PHOTO_PICKER_LABELS, useAppLocaleStore } from '../i18n/appLocale';

function promptLabels() {
  const [promptLabelHeader, promptLabelPhoto, promptLabelPicture, promptLabelCancel] = PHOTO_PICKER_LABELS[useAppLocaleStore.getState().locale];
  return { promptLabelHeader, promptLabelPhoto, promptLabelPicture, promptLabelCancel };
}

export const nativeCamera = {
  async takePhoto(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        ...promptLabels(),
      });
      return image.webPath || image.path || null;
    }
    // Web fallback for development
    return null;
  },

  async choosePhoto(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return null;
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      ...promptLabels(),
    });
    return image.webPath || image.path || null;
  },

  async pickImages(): Promise<string[]> {
    if (Capacitor.isNativePlatform()) {
      const gallery = await Camera.pickImages({
        quality: 90,
        limit: 6,
      });
      return gallery.photos.map((p) => p.webPath).filter(Boolean) as string[];
    }
    return [];
  },
};

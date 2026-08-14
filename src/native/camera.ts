import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export const nativeCamera = {
  async takePhoto(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
      return image.webPath || image.path || null;
    }
    // Web fallback for development
    return null;
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

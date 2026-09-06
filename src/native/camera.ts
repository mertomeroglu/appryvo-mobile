import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { App, RestoredListenerEvent } from '@capacitor/app';
import { PHOTO_PICKER_LABELS, useAppLocaleStore } from '../i18n/appLocale';
import { crashReporting } from './crashReporting';

export type CameraErrorCode =
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'NATIVE_CAMERA_ERROR'
  | 'PROCESS_RESTORED'
  | 'UNKNOWN_CAMERA_ERROR';

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  readonly isPermanent: boolean;
  readonly isCancellation: boolean;

  constructor(message: string, code: CameraErrorCode, isPermanent = false) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.isPermanent = isPermanent;
    this.isCancellation = code === 'USER_CANCELLED';
  }
}

function promptLabels() {
  const [promptLabelHeader, promptLabelPhoto, promptLabelPicture, promptLabelCancel] =
    PHOTO_PICKER_LABELS[useAppLocaleStore.getState().locale];
  return { promptLabelHeader, promptLabelPhoto, promptLabelPicture, promptLabelCancel };
}

// Concurrency mutex to prevent duplicate Activity launches on Android
let cameraBusy = false;

// Process-death restoration subscribers and deduplication state
type RestoredPhotoListener = (uri: string) => void;
const restoredListeners = new Set<RestoredPhotoListener>();
let lastHandledRestoredKey: string | null = null;
let pendingRestoredUri: string | null = null;
let appRestoredListenerRegistered = false;

function resolveImageUri(webPath?: string, path?: string): string | null {
  if (webPath) return webPath;
  if (path) {
    return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(path) : path;
  }
  return null;
}

export function initCameraAppRestoredListener(): void {
  if (!Capacitor.isNativePlatform() || appRestoredListenerRegistered) return;
  appRestoredListenerRegistered = true;

  try {
    App.addListener('appRestoredResult', (result: RestoredListenerEvent) => {
      crashReporting.log(
        `[CAMERA] appRestoredResult received: plugin=${result.pluginId}, method=${result.methodName}, success=${result.success}`
      );

      if (result.pluginId !== 'Camera') return;

      if (!result.success) {
        const errorMsg = result.error?.message || 'Unknown restored camera error';
        crashReporting.log(`[CAMERA] Restored camera result failed: ${errorMsg}`);
        return;
      }

      let restoredUri: string | null = null;
      if (result.methodName === 'getPhoto' && result.data) {
        restoredUri = resolveImageUri(result.data.webPath, result.data.path);
      } else if (
        result.methodName === 'pickImages' &&
        Array.isArray(result.data?.photos) &&
        result.data.photos.length > 0
      ) {
        const first = result.data.photos[0];
        restoredUri = resolveImageUri(first?.webPath, first?.path);
      }

      if (restoredUri) {
        if (lastHandledRestoredKey === restoredUri) return;
        lastHandledRestoredKey = restoredUri;

        if (restoredListeners.size > 0) {
          restoredListeners.forEach((fn) => {
            try {
              fn(restoredUri!);
            } catch (err) {
              crashReporting.recordException(err, 'nativeCamera.restoredListener');
            }
          });
        } else {
          pendingRestoredUri = restoredUri;
        }
      }
    }).catch(() => {});
  } catch {
    // Non-fatal if App listener registration fails
  }
}

// Auto-initialize restoration listener on import for native platform
if (Capacitor.isNativePlatform()) {
  initCameraAppRestoredListener();
}

export const nativeCamera = {
  isBusy(): boolean {
    return cameraBusy;
  },

  async checkPermissions(): Promise<PermissionStatus> {
    if (Capacitor.isNativePlatform()) {
      return await Camera.checkPermissions();
    }
    return { camera: 'granted', photos: 'granted' };
  },

  async requestPermissions(): Promise<PermissionStatus> {
    if (Capacitor.isNativePlatform()) {
      return await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    }
    return { camera: 'granted', photos: 'granted' };
  },

  async ensureCameraPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;

    try {
      const status = await Camera.checkPermissions();
      if (status.camera === 'granted') {
        return true;
      }

      if (status.camera === 'prompt' || status.camera === 'prompt-with-rationale') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera === 'granted') {
          return true;
        }
        throw new CameraError(
          'Camera permission denied by user',
          'PERMISSION_DENIED',
          requested.camera === 'denied'
        );
      }

      throw new CameraError(
        'Camera permission is permanently denied. Please enable it in device settings.',
        'PERMISSION_DENIED',
        true
      );
    } catch (err) {
      if (err instanceof CameraError) throw err;
      throw new CameraError(
        err instanceof Error ? err.message : 'Camera permission check failed',
        'PERMISSION_DENIED'
      );
    }
  },

  async takePhoto(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      // Web fallback for development
      return null;
    }

    if (cameraBusy) {
      return null;
    }
    cameraBusy = true;

    try {
      await this.ensureCameraPermission();

      crashReporting.log('[CAMERA] Launching native camera capture');
      // allowEditing MUST be false: Ryvo owns its own in-app crop UX,
      // and native editing triggers com.android.camera.action.CROP which
      // throws ActivityNotFoundException on modern Android devices.
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        ...promptLabels(),
      });

      const uri = resolveImageUri(image.webPath, image.path);
      if (!uri) {
        throw new CameraError('Empty image path returned from camera', 'UNKNOWN_CAMERA_ERROR');
      }

      crashReporting.log('[CAMERA] Native capture succeeded');
      return uri;
    } catch (err: any) {
      if (err instanceof CameraError) {
        throw err;
      }

      const msg = String(err?.message || err || '');
      if (/cancel|closed|dismiss|did not select/i.test(msg)) {
        throw new CameraError('User cancelled camera capture', 'USER_CANCELLED');
      }
      if (/permission/i.test(msg)) {
        throw new CameraError('Camera permission denied', 'PERMISSION_DENIED');
      }
      if (/unavailable|no camera|not available/i.test(msg)) {
        throw new CameraError('Camera hardware unavailable', 'CAMERA_UNAVAILABLE');
      }

      crashReporting.recordException(err, 'nativeCamera.takePhoto');
      throw new CameraError(msg || 'Native camera error', 'NATIVE_CAMERA_ERROR');
    } finally {
      cameraBusy = false;
    }
  },

  async choosePhoto(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return null;

    if (cameraBusy) return null;
    cameraBusy = true;

    try {
      crashReporting.log('[CAMERA] Launching photo picker');
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        ...promptLabels(),
      });

      const uri = resolveImageUri(image.webPath, image.path);
      return uri;
    } catch (err: any) {
      if (err instanceof CameraError) throw err;

      const msg = String(err?.message || err || '');
      if (/cancel|closed|dismiss|did not select/i.test(msg)) {
        throw new CameraError('User cancelled photo picker', 'USER_CANCELLED');
      }
      if (/permission/i.test(msg)) {
        throw new CameraError('Photo permission denied', 'PERMISSION_DENIED');
      }

      crashReporting.recordException(err, 'nativeCamera.choosePhoto');
      throw new CameraError(msg || 'Native photo selection error', 'NATIVE_CAMERA_ERROR');
    } finally {
      cameraBusy = false;
    }
  },

  async pickImages(): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) return [];

    if (cameraBusy) return [];
    cameraBusy = true;

    try {
      crashReporting.log('[CAMERA] Launching pickImages');
      const gallery = await Camera.pickImages({
        quality: 90,
        limit: 6,
      });

      return gallery.photos
        .map((p) => resolveImageUri(p.webPath, p.path))
        .filter(Boolean) as string[];
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/cancel|closed|dismiss|did not select/i.test(msg)) {
        return [];
      }
      if (/permission/i.test(msg)) {
        throw new CameraError('Gallery permission denied', 'PERMISSION_DENIED');
      }

      crashReporting.recordException(err, 'nativeCamera.pickImages');
      throw new CameraError(msg || 'Failed to pick images', 'NATIVE_CAMERA_ERROR');
    } finally {
      cameraBusy = false;
    }
  },

  onRestoredPhoto(listener: RestoredPhotoListener): () => void {
    restoredListeners.add(listener);
    if (pendingRestoredUri) {
      const uri = pendingRestoredUri;
      pendingRestoredUri = null;
      try {
        listener(uri);
      } catch (err) {
        crashReporting.recordException(err, 'nativeCamera.onRestoredPhotoImmediate');
      }
    }
    return () => {
      restoredListeners.delete(listener);
    };
  },
};

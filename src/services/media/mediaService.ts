import { API_BASE_URL, apiClient, customFetch, fetchAuthenticatedBlob } from '../api/apiClient';

const PUBLIC_ASSET_BASE_URL = (import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || 'https://appryvo.online').replace(/\/+$/, '');

export interface UploadMediaResult {
  status: string;
  data: {
    url: string;
    variants?: {
      thumbnail?: string;
      medium?: string;
      full?: string;
    };
  };
}

export interface RegistrationPhotoUploadResult extends UploadMediaResult {
  data: UploadMediaResult['data'] & { uploadToken: string };
}

export type MediaUploadCategory = 'profile' | 'chat' | 'social' | 'voice' | 'verification' | 'room_cover';

// A "photo" shows up in three different shapes across the API depending on the endpoint:
//   - a plain URL string (discovery feed / full profile / matches: server already flattens
//     these to strings before sending)
//   - { url } (older/simplified shape, still used by a couple of upload responses)
//   - { original, thumbnail, medium, large } (GET /api/me -- see buildPublicImageVariants on
//     the server; this one has no `.url` field at all)
// Reading `.url` unconditionally on a /api/me photo silently returns undefined -- confirmed
// on-device as both a broken own-profile avatar (falls back to initials) and, worse, a data-
// loss bug: EditProfileModal's save payload does `photos.filter(p => p.url)`, so an existing
// photo whose `.url` is undefined gets silently dropped from the very next save.
export const getPhotoUrl = (photo: unknown): string | undefined => {
  if (!photo) return undefined;
  if (typeof photo === 'string') return photo;
  if (typeof photo === 'object') {
    const p = photo as Record<string, unknown>;
    const candidate = p.url || p.original || p.large || p.medium || p.thumbnail;
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
};

export const normalizeMediaUrl = (url?: string | null): string => {
  if (!url) return `${API_BASE_URL}/media/public/default-avatar.png`;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/')) {
    if (url.startsWith('/assets/frames/')) return `${PUBLIC_ASSET_BASE_URL}${url}`;
    return `${API_BASE_URL}${url}`;
  }
  if (url.startsWith('assets/frames/')) return `${PUBLIC_ASSET_BASE_URL}/${url}`;
  return `${API_BASE_URL}/${url}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const mediaService = {
  async getAuthenticatedObjectUrl(url: string): Promise<string> {
    const normalized = normalizeMediaUrl(url);
    if (!normalized.includes('/api/media/private/')) return normalized;
    const blob = await fetchAuthenticatedBlob(normalized);
    return URL.createObjectURL(blob);
  },
  async uploadRegistrationPhoto(file: File | Blob): Promise<RegistrationPhotoUploadResult> {
    const base64Data = await blobToBase64(file);
    return await apiClient.post(
      '/api/auth/register/photo',
      { base64Data, mimeType: file.type || 'image/jpeg' },
      { skipAuth: true, timeoutMs: 60000 }
    );
  },
  // Server contract (media_controller.js POST /api/media/upload) is JSON
  // { base64Data, category, mimeType }, not multipart/form-data — it never
  // parses multipart bodies, so a FormData POST silently 400s with
  // "base64Data gereklidir." for every upload.
  async uploadMedia(
    file: File | Blob,
    category: MediaUploadCategory = 'profile',
    abortSignal?: AbortSignal
  ): Promise<UploadMediaResult> {
    const base64Data = await blobToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    return await mediaService.uploadBase64(base64Data, category, abortSignal, mimeType);
  },

  async uploadBase64(
    base64Data: string,
    category: MediaUploadCategory = 'profile',
    abortSignal?: AbortSignal,
    mimeType: string = 'image/jpeg'
  ): Promise<UploadMediaResult> {
    return await customFetch('/api/media/upload', {
      method: 'POST',
      body: { base64Data, category, mimeType },
      signal: abortSignal,
      timeoutMs: 60000,
    });
  },
};

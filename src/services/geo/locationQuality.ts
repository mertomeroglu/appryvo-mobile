import { nativeLocation } from '../../native/location';

export const LOCATION_MAX_AGE_MS = 30_000;
export const LOCATION_MAX_ACCURACY_METERS = 200;

export function isUsableLocation(position: any, now = Date.now()): boolean {
  const coords = position?.coords;
  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  const accuracy = Number(coords?.accuracy);
  const timestamp = Number(position?.timestamp);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= LOCATION_MAX_ACCURACY_METERS
    && Number.isFinite(timestamp) && timestamp > 0 && now - timestamp <= LOCATION_MAX_AGE_MS
    && timestamp <= now + 5_000;
}

export async function acquireBestLocation(): Promise<any> {
  const preferred = await nativeLocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 8_000,
    maximumAge: 0,
  }).catch(() => null);
  if (isUsableLocation(preferred)) return preferred;

  return await new Promise<any>(async (resolve, reject) => {
    let best: any = preferred;
    let settled = false;
    let watchId: string | null = null;
    const finish = async (value?: any, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await nativeLocation.clearWatch(watchId).catch((err) => console.warn('[LOCATION] clearWatch failed', err));
      if (value && isUsableLocation(value)) resolve(value);
      else reject(error || new Error('Reliable current location could not be determined.'));
    };
    const timer = setTimeout(() => void finish(best), 7_000);
    try {
      watchId = await nativeLocation.watchPosition((position, error) => {
        if (error) return;
        if (position && (!best || Number(position.coords?.accuracy) < Number(best.coords?.accuracy))) best = position;
        if (isUsableLocation(position) && Number(position.coords.accuracy) <= 50) void finish(position);
      }, { enableHighAccuracy: true, timeout: 7_000, maximumAge: 0 });
    } catch (error) {
      void finish(best, error instanceof Error ? error : new Error('Location watch failed.'));
    }
  });
}

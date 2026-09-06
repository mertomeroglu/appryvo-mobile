import { Geolocation, PermissionStatus, PositionOptions } from '@capacitor/geolocation';
import { Capacitor, PermissionState } from '@capacitor/core';

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'LOCATION_TIMEOUT'
  | 'UNKNOWN';

export class LocationError extends Error {
  readonly code: LocationErrorCode;
  readonly isPermanent: boolean;

  constructor(message: string, code: LocationErrorCode, isPermanent = false) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
    this.isPermanent = isPermanent;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export const nativeLocation = {
  async checkPermissions(): Promise<PermissionStatus> {
    if (Capacitor.isNativePlatform()) {
      return await Geolocation.checkPermissions();
    }
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return {
          location: status.state as PermissionState,
          coarseLocation: status.state as PermissionState,
        };
      } catch {
        return { location: 'prompt', coarseLocation: 'prompt' };
      }
    }
    return { location: 'prompt', coarseLocation: 'prompt' };
  },

  async requestPermissions(): Promise<PermissionStatus> {
    if (Capacitor.isNativePlatform()) {
      return await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    }
    return { location: 'granted', coarseLocation: 'granted' };
  },

  async ensurePermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;

    try {
      const current = await this.checkPermissions();
      if (current.location === 'granted' || current.coarseLocation === 'granted') {
        return true;
      }

      if (
        current.location === 'prompt' ||
        current.location === 'prompt-with-rationale' ||
        current.coarseLocation === 'prompt' ||
        current.coarseLocation === 'prompt-with-rationale'
      ) {
        const requested = await this.requestPermissions();
        if (requested.location === 'granted' || requested.coarseLocation === 'granted') {
          return true;
        }
        throw new LocationError(
          'Location permission denied by user',
          'PERMISSION_DENIED',
          requested.location === 'denied'
        );
      }

      throw new LocationError(
        'Location permission permanently denied. Enable in device settings.',
        'PERMISSION_DENIED',
        true
      );
    } catch (err) {
      if (err instanceof LocationError) throw err;
      throw new LocationError(
        err instanceof Error ? err.message : 'Location permission check failed',
        'PERMISSION_DENIED'
      );
    }
  },

  async getCurrentPosition(options?: PositionOptions) {
    if (Capacitor.isNativePlatform()) {
      await this.ensurePermission();
    }

    const positionPromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        return await Geolocation.getCurrentPosition(options);
      }
      return new Promise((resolve, reject) => {
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                timestamp: pos.timestamp,
                coords: {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                  altitude: pos.coords.altitude,
                  altitudeAccuracy: pos.coords.altitudeAccuracy,
                  heading: pos.coords.heading,
                  speed: pos.coords.speed,
                },
              }),
            (err) => reject(err),
            options
          );
        } else {
          reject(new LocationError('Geolocation not available', 'POSITION_UNAVAILABLE'));
        }
      });
    })();

    // @capacitor/geolocation@7's own `options.timeout` is not reliably honored by the Android
    // FusedLocationProviderClient bridge on a cold fix (no cached last-known-location yet) --
    // observed as a multi-minute hang on first-ever permission grant that "fixes itself" after
    // an app restart, because the restart's request can be satisfied by a now-cached location.
    // Enforcing the bound ourselves guarantees callers never see an infinite spinner regardless
    // of native plugin behavior.
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    // A late settle from the loser of the race below must never surface as an unhandled
    // promise rejection once the timeout has already won.
    positionPromise.catch(() => {});

    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new LocationError('Location request timed out.', 'LOCATION_TIMEOUT'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([positionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  },

  async watchPosition(callback: (pos: any, err?: any) => void, options?: PositionOptions) {
    if (Capacitor.isNativePlatform()) {
      try {
        await this.ensurePermission();
      } catch (err) {
        callback(null, err);
        return null;
      }
      return await Geolocation.watchPosition(options || {}, callback);
    }
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        (pos) => callback(pos),
        (err) => callback(null, err),
        options
      );
      return id.toString();
    }
    return null;
  },

  async clearWatch(id: string | null) {
    if (!id) return;
    if (Capacitor.isNativePlatform()) {
      await Geolocation.clearWatch({ id });
    } else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(Number(id));
    }
  },
};

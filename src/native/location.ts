import { Geolocation, PositionOptions } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

const DEFAULT_TIMEOUT_MS = 15000;

export const nativeLocation = {
  async getCurrentPosition(options?: PositionOptions) {
    const positionPromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        return await Geolocation.getCurrentPosition(options);
      }
      return new Promise((resolve, reject) => {
        if ('geolocation' in navigator) {
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
          reject(new Error('Geolocation not available'));
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
        reject(Object.assign(new Error('Location request timed out.'), { code: 'LOCATION_TIMEOUT' }));
      }, timeoutMs);
    });

    try {
      return await Promise.race([positionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  },

  async watchPosition(callback: (pos: any) => void) {
    if (Capacitor.isNativePlatform()) {
      return await Geolocation.watchPosition({}, callback);
    }
    if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(callback);
      return id.toString();
    }
    return null;
  },
};

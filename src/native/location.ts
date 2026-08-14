import { Geolocation, PositionOptions } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export const nativeLocation = {
  async getCurrentPosition(options?: PositionOptions) {
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

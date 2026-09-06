import type { GeoCityResult } from '../../services/geo/cityService';

interface GeographyMap {
  flyTo(options: { center: [number, number]; zoom: number; duration: number }): unknown;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: { padding: number; duration: number; maxZoom: number }
  ): unknown;
}

export const CITY_SEARCH_ZOOM = 13;
export const COUNTRY_SEARCH_ZOOM = 5;
export const SEARCH_FLY_DURATION_MS = 1100;

export function navigateMapToGeography(map: GeographyMap | null, result: GeoCityResult): void {
  if (!map || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return;
  if (
    result.type === 'country'
    && typeof result.westLongitude === 'number'
    && typeof result.southLatitude === 'number'
    && typeof result.eastLongitude === 'number'
    && typeof result.northLatitude === 'number'
  ) {
    map.fitBounds(
      [[result.westLongitude, result.southLatitude], [result.eastLongitude, result.northLatitude]],
      { padding: 48, duration: SEARCH_FLY_DURATION_MS, maxZoom: COUNTRY_SEARCH_ZOOM }
    );
    return;
  }
  map.flyTo({
    center: [result.longitude, result.latitude],
    zoom: result.type === 'country' ? COUNTRY_SEARCH_ZOOM : CITY_SEARCH_ZOOM,
    duration: SEARCH_FLY_DURATION_MS,
  });
}

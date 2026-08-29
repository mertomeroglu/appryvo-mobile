// Single shared implementation of the city/geo search used by both SocialMapScreen and
// PassportScreen -- previously each screen had its own independent copy-pasted fetch + DTO
// mapping, which had already drifted once (see PassportScreen's prior fix for city.city/
// city.latitude/city.longitude/city.country vs. the name/lat/lng fields the UI used to assume).
// Diacritics/transliteration (e.g. "Istanbul" -> "İstanbul", "Munchen" -> "München") is entirely
// server-side (see Prompt 02's unaccent-based geo search) -- this only ever sends the raw query
// string and maps whatever comes back; it never guesses at normalization itself.
import { apiClient } from '../api/apiClient';

export interface GeoCityResult {
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

// Throws on a network/server failure so callers can distinguish "no matches" (empty array) from
// "the request failed" (their own error state) instead of both silently rendering nothing.
export async function searchCities(query: string): Promise<GeoCityResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const res: any = await apiClient.get(`/api/geo/search-cities?query=${encodeURIComponent(trimmed)}`);
  const raw = Array.isArray(res?.data) ? res.data : [];

  return raw
    .map((entry: any): GeoCityResult | null => {
      const city = entry?.city || entry?.name;
      if (!city) return null;
      return {
        city,
        country: entry?.country,
        latitude: typeof entry?.latitude === 'number' ? entry.latitude : undefined,
        longitude: typeof entry?.longitude === 'number' ? entry.longitude : undefined,
      };
    })
    .filter((entry: GeoCityResult | null): entry is GeoCityResult => entry !== null);
}

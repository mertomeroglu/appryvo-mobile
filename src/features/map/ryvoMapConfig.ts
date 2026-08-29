// Centralizes where SocialMapScreen's OpenMapTiles vector source comes from, so there is exactly
// one place a reviewer needs to check to confirm production never ships a demo/paid-provider key.
//
// PRODUCT DECISION (RYVO PATCH V5 02): production points directly at OpenFreeMap
// (https://openfreemap.org), not a self-hosted TileServer GL. The VPS this app runs on has only
// ~22GB free disk; a self-hosted global planet.mbtiles at the zoom range this app needs (0-15)
// typically runs 70-100GB+, which doesn't fit, and Ryvo's map only needs a light social-discovery
// basemap, not full self-hosted tile-serving infrastructure. OpenFreeMap is free, keyless, has no
// documented request limit, and its operator explicitly states commercial use is permitted (see
// https://openfreemap.org) -- verified reachable with `Access-Control-Allow-Origin: *` and a valid
// OpenMapTiles-schema TileJSON response at the time this was written, so no reverse proxy is
// needed for CORS (capacitor://localhost and the production origin both already work directly).
// The one real tradeoff, called out explicitly rather than hidden: the operator states no formal
// SLA/uptime guarantee -- an OpenFreeMap outage would show as a map outage in Ryvo. Accepted as
// the pragmatic tradeoff given the disk/ops-burden alternative.
//
// VITE_OPENMAPTILES_TILEJSON_URL remains a real override (self-hosted, or a different vector-tile
// provider entirely), never a hardcoded demo/public paid-provider key -- if set, it fully replaces
// OpenFreeMap below.
const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

const envTileJsonUrl = (import.meta.env.VITE_OPENMAPTILES_TILEJSON_URL as string | undefined)?.trim();

export const OPENMAPTILES_TILEJSON_URL: string = envTileJsonUrl || OPENFREEMAP_TILEJSON_URL;
export const OPENMAPTILES_SPRITE_URL: string | undefined =
  (import.meta.env.VITE_OPENMAPTILES_SPRITE_URL as string | undefined)?.trim() || undefined;
export const OPENMAPTILES_GLYPHS_URL: string | undefined =
  (import.meta.env.VITE_OPENMAPTILES_GLYPHS_URL as string | undefined)?.trim() || undefined;

// Always true today (OpenFreeMap is a permanent fallback, not a dev-only one) -- kept as an
// explicit check rather than assumed, so an operator who deliberately overrides
// VITE_OPENMAPTILES_TILEJSON_URL to an empty string to disable the map still gets the visible
// "map unavailable" state in SocialMapScreen instead of a silently broken map init.
export const isRyvoMapConfigured = (): boolean => Boolean(OPENMAPTILES_TILEJSON_URL);

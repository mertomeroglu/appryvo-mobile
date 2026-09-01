// Custom "Ryvo map" MapLibre style: an OpenMapTiles-schema vector source rendered through a
// deliberately quiet, social-discovery-first style, not a general-purpose street map. Follows
// OpenMapTiles' own recommended integration (MapLibre GL JS + a StyleSpecification JSON + a
// vector source backed by a TileJSON) -- see prompt 02 for the actual production TileServer GL
// standing behind these URLs; this module only ever reads already-configured endpoints, never a
// baked-in provider or demo key.
//
// The vector source below takes an already-resolved `tiles` URL template rather than a bare
// `url: tileJsonUrl` for MapLibre to auto-fetch itself -- see the fetch in SocialMapScreen.tsx's
// map-init effect for why: MapLibre's own TileJSON auto-resolution was confirmed (RYVO PATCH V5
// 03, on-device) to silently never settle in this Capacitor/Android WebView build, while a plain
// fetch() to the identical URL always succeeds. The caller fetches the TileJSON itself and passes
// the resolved fields in; MapLibre's own per-tile fetching (independently verified working) still
// handles every actual .pbf request from there.
//
// Every layer below is a deliberate simplification pass over the standard OpenMapTiles schema
// (https://openmaptiles.org/schema/), not the schema's own defaults:
//   - mountain_peak, housenumber: omitted entirely (no layer at all)
//   - poi: omitted below zoom 16, and even then rendered as a barely-visible dot -- this is a
//     "who's near me" social map, not a POI browser
//   - building: very low opacity, and only from zoom 15 (near the map's own maxZoom of 15)
//   - transportation_name: motorway/trunk/primary only, never minor streets
//   - water_name: single minimal label style, no size/weight escalation by feature size
//   - landuse/landcover/park: soft, desaturated fills -- texture, not information density
//   - place: country/state/city given real visual weight; town/village/suburb are present but
//     intentionally faint, hamlet/neighbourhood omitted
//   - no contour/terrain/hillshade source or layer -- the OpenMapTiles vector schema doesn't
//     ship one anyway (that would be a separate raster-dem source), so this is trivially true,
//     not something that had to be actively removed
import type { StyleSpecification } from 'maplibre-gl';

export type RyvoMapTheme = 'light' | 'dark';

export interface ResolvedTileSource {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
}

export interface RyvoMapStyleConfig {
  tileSource: ResolvedTileSource;
  spriteUrl?: string;
  glyphsUrl?: string;
}

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

const PALETTE: Record<RyvoMapTheme, {
  background: string;
  water: string;
  landcover: string;
  landuse: string;
  park: string;
  boundary: string;
  building: string;
  roadMajor: string;
  roadMajorCasing: string;
  roadMinor: string;
  placeCountry: string;
  placeState: string;
  placeCity: string;
  placeTown: string;
  waterName: string;
  roadName: string;
  poi: string;
  labelHalo: string;
}> = {
  // V3: the map moved from a deliberately near-monochrome "texture, not information" palette to
  // a visibly green/blue "friendly social map" look (land clearly green, parks a stronger green,
  // water clearly blue) -- everything else about the style (minzoom gating, label density,
  // building/POI de-emphasis) is unchanged from the design intent documented at the top of this
  // file, only the actual color values below moved.
  light: {
    background: '#eef6e6',
    water: '#8fcfe8',
    landcover: '#d9ecc7',
    landuse: '#d3e8c2',
    park: '#a9dd8a',
    boundary: '#9fbf8f',
    building: '#c7dab3',
    roadMajor: '#ffffff',
    roadMajorCasing: '#cfe3bd',
    roadMinor: '#e3f0d8',
    placeCountry: '#4a5a3f',
    placeState: '#5f7052',
    placeCity: '#33421f',
    placeTown: '#6f8060',
    waterName: '#2f7a9c',
    roadName: '#7a8a6c',
    poi: '#9ccB7f',
    labelHalo: 'rgba(238,246,230,0.85)',
  },
  dark: {
    background: '#0f1a12',
    water: '#123049',
    landcover: '#16261a',
    landuse: '#182a1c',
    park: '#1e3a24',
    boundary: '#2e4a34',
    building: '#1c2e20',
    roadMajor: '#2c3f2e',
    roadMajorCasing: '#18281b',
    roadMinor: '#1a2c1e',
    placeCountry: '#b8d4a8',
    placeState: '#93b382',
    placeCity: '#d6ecc8',
    placeTown: '#6f8f63',
    waterName: '#6fb3d8',
    roadName: '#7a9a6e',
    poi: '#4a6e42',
    labelHalo: 'rgba(15,26,18,0.85)',
  },
};

// Motorway/trunk/primary only -- "sadece ana yollar" for transportation_name. The `transportation`
// fill layer (unlabeled road ribbons, kept for spatial context) still renders minor/service roads
// at a barely-there weight so the map doesn't look like bare landmass, but nothing below primary
// ever gets a text label.
const MAJOR_ROAD_CLASSES = ['motorway', 'trunk', 'primary'];

// place.class hierarchy kept vs. faded vs. dropped -- "country/state/major city öncelikli, minor
// town/village azalt". `suburb`/`neighbourhood`/`hamlet` are omitted outright (no filter branch
// renders them).
const CITY_LIKE_CLASSES = ['city', 'town'];

export function buildRyvoMapStyle(theme: RyvoMapTheme, config: RyvoMapStyleConfig): StyleSpecification {
  const c = PALETTE[theme];
  const sourceId = 'openmaptiles';

  return {
    version: 8,
    name: `ryvo-${theme}`,
    // Matches the OpenFreeMap tile source default (ryvoMapConfig.ts) -- verified reachable
    // (200, real glyph PBFs) at the time this was written. Overridable via
    // VITE_OPENMAPTILES_GLYPHS_URL for a self-hosted/paid provider, same as the tile source.
    glyphs: config.glyphsUrl || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: config.spriteUrl,
    sources: {
      [sourceId]: {
        type: 'vector',
        tiles: config.tileSource.tiles,
        minzoom: config.tileSource.minzoom,
        maxzoom: config.tileSource.maxzoom,
        bounds: config.tileSource.bounds,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.background } },

      // --- Land texture: soft, not informational ---
      {
        id: 'landcover', type: 'fill', source: sourceId, 'source-layer': 'landcover',
        paint: { 'fill-color': c.landcover, 'fill-opacity': theme === 'dark' ? 0.5 : 0.6 },
      },
      {
        id: 'landuse', type: 'fill', source: sourceId, 'source-layer': 'landuse',
        paint: { 'fill-color': c.landuse, 'fill-opacity': theme === 'dark' ? 0.4 : 0.5 },
      },
      {
        id: 'park', type: 'fill', source: sourceId, 'source-layer': 'park',
        paint: { 'fill-color': c.park, 'fill-opacity': theme === 'dark' ? 0.35 : 0.55 },
      },

      // --- Water: kept legible (orientation matters), never emphasized beyond a quiet fill ---
      {
        id: 'water', type: 'fill', source: sourceId, 'source-layer': 'water',
        paint: { 'fill-color': c.water, 'fill-opacity': 1 },
      },
      {
        id: 'waterway', type: 'line', source: sourceId, 'source-layer': 'waterway',
        paint: { 'line-color': c.water, 'line-width': 1 },
      },

      // --- Buildings: very low opacity, only once zoomed in close to the map's own 15 max-zoom ---
      {
        id: 'building', type: 'fill', source: sourceId, 'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.35] },
      },

      // --- Roads: unlabeled ribbons for spatial context, weighted down for minor classes ---
      {
        id: 'transportation-minor', type: 'line', source: sourceId, 'source-layer': 'transportation',
        filter: ['!', ['in', ['get', 'class'], ['literal', [...MAJOR_ROAD_CLASSES, 'motorway_construction']]]],
        minzoom: 11,
        paint: { 'line-color': c.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 15, 1] },
      },
      {
        id: 'transportation-major-casing', type: 'line', source: sourceId, 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', MAJOR_ROAD_CLASSES]],
        paint: { 'line-color': c.roadMajorCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 15, 5] },
      },
      {
        id: 'transportation-major', type: 'line', source: sourceId, 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', MAJOR_ROAD_CLASSES]],
        paint: { 'line-color': c.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 15, 3] },
      },

      // --- Admin boundaries: kept for orientation, quiet dashed line ---
      {
        id: 'boundary', type: 'line', source: sourceId, 'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': c.boundary, 'line-width': 1, 'line-dasharray': [2, 2] },
      },

      // --- POI: omitted entirely below zoom 16, and even then just a small dot -- no icons, no
      //     labels. This is intentionally far below the map's own maxZoom of 15, so in practice
      //     POI dots never actually become reachable through normal use; kept as a defined layer
      //     (rather than removed outright) only so a future maxZoom increase doesn't silently
      //     reintroduce full POI density without a deliberate style change too. ---
      {
        id: 'poi', type: 'circle', source: sourceId, 'source-layer': 'poi',
        minzoom: 16,
        paint: { 'circle-color': c.poi, 'circle-radius': 2, 'circle-opacity': 0.6 },
      },

      // --- transportation_name: major roads only, never minor streets ---
      {
        id: 'transportation-name-major', type: 'symbol', source: sourceId, 'source-layer': 'transportation_name',
        filter: ['in', ['get', 'class'], ['literal', MAJOR_ROAD_CLASSES]],
        minzoom: 12,
        layout: {
          'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR,
          'text-size': 11, 'text-letter-spacing': 0.02,
        },
        paint: { 'text-color': c.roadName, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },

      // --- water_name: one minimal style, no scaling by feature importance ---
      {
        id: 'water-name', type: 'symbol', source: sourceId, 'source-layer': 'water_name',
        minzoom: 6,
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR, 'text-size': 10 },
        paint: { 'text-color': c.waterName, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },

      // --- place: country/state carry real weight; city/town present but de-emphasized;
      //     suburb/neighbourhood/hamlet never rendered at all (no filter branch for them) ---
      {
        id: 'place-country', type: 'symbol', source: sourceId, 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14],
          'text-transform': 'uppercase', 'text-letter-spacing': 0.08,
        },
        paint: { 'text-color': c.placeCountry, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-state', type: 'symbol', source: sourceId, 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'state'],
        minzoom: 4,
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT_REGULAR,
          'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.06,
        },
        paint: { 'text-color': c.placeState, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },
      {
        id: 'place-city', type: 'symbol', source: sourceId, 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', CITY_LIKE_CLASSES]],
        minzoom: 5,
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 15],
        },
        paint: { 'text-color': c.placeCity, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-town', type: 'symbol', source: sourceId, 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'village'],
        minzoom: 10,
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR, 'text-size': 10 },
        paint: { 'text-color': c.placeTown, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },
      // mountain_peak, housenumber: no layer -- omitted entirely, not just hidden/filtered.
    ],
  };
}

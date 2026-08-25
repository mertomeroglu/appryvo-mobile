export type PushData = Record<string, unknown>;

const SAFE_ROUTE = /^\/(discover|likes|messages|notifications|profile|verification|premium|boost|frames|passport|confessions)(\/|\?|$)/;

// The app's own custom URL scheme (AndroidManifest.xml custom_url_scheme, aligned with iOS's
// CFBundleURLSchemes so a share link works identically on both platforms) -- e.g. a share link
// opened as appryvo://premium.
const CUSTOM_SCHEME_PREFIX = 'appryvo://';

export function safeRoute(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let candidate = value.trim();
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (!/(^|\.)appryvo\.online$/i.test(url.hostname)) return null;
      candidate = `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  } else if (candidate.toLowerCase().startsWith(CUSTOM_SCHEME_PREFIX)) {
    const rest = candidate.slice(CUSTOM_SCHEME_PREFIX.length);
    candidate = rest.startsWith('/') ? rest : `/${rest}`;
  }
  if (candidate === '/matches' || candidate.startsWith('/matches?')) {
    candidate = candidate.replace('/matches', '/messages');
  }
  return SAFE_ROUTE.test(candidate) ? candidate : null;
}

/**
 * Resolves an incoming deep link (Capacitor `appUrlOpen` event URL, either the
 * com.appryvo.ryvo:// custom scheme or an https://appryvo.online/... universal link)
 * to a safe in-app route, or null if it doesn't match any known/allowed destination.
 */
export function resolveDeepLinkDestination(url: string): string | null {
  return safeRoute(url);
}

export function resolvePushDestination(data: PushData): string | null {
  const type = String(data.type || data.eventType || '').trim().toLowerCase();
  const matchId = String(data.matchId || '').trim();
  if (matchId && ['chat', 'message', 'match', 'gift', 'chat_gift'].includes(type)) {
    return `/chat/${encodeURIComponent(matchId)}`;
  }
  if (['like', 'super_like', 'match_note', 'someone_liked_you'].includes(type)) return '/likes';
  if (['moderator_message', 'admin', 'system'].includes(type)) return '/messages/ryvo';
  if (type === 'verification_reminder') return '/verification';
  if (type.startsWith('verification_')) return '/profile';
  if (['social', 'confession', 'confession_comment'].includes(type)) return '/confessions';
  if (type === 'premium' || type === 'premium_expiring') return '/premium';
  if (type === 'boost' || type === 'boost_ending') return '/boost';
  if (['incoming_call', 'missed_call', 'call'].includes(type)) return matchId ? `/chat/${encodeURIComponent(matchId)}` : '/messages';
  return safeRoute(data.route) || safeRoute(data.ctaUrl);
}

export function shouldSuppressForegroundPush(data: PushData, currentPath: string): boolean {
  const type = String(data.type || data.eventType || '').trim().toLowerCase();
  const matchId = String(data.matchId || '').trim();
  if (!matchId || !['chat', 'message', 'gift', 'chat_gift'].includes(type)) return false;
  return currentPath === `/chat/${encodeURIComponent(matchId)}`;
}

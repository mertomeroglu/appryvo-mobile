export const VPN_BLOCKED_EVENT = 'ryvo:vpn-blocked';

export interface VpnBlockedDetail {
  tr?: string;
  en?: string;
}

export function notifyVpnBlocked(detail?: VpnBlockedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VpnBlockedDetail>(VPN_BLOCKED_EVENT, { detail }));
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiException, customFetch } from '../src/services/api/apiClient';
import { VPN_BLOCKED_EVENT, VpnBlockedDetail } from '../src/services/security/vpnAccess';

describe('VPN access UX', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves the normalized VPN code and announces the dedicated localized UX', async () => {
    let detail: VpnBlockedDetail | undefined;
    window.addEventListener(VPN_BLOCKED_EVENT, (event) => {
      detail = (event as CustomEvent<VpnBlockedDetail>).detail;
    }, { once: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'error',
      code: 'VPN_NOT_ALLOWED',
      message: 'VPN bağlantısı algılandı.',
      localizedMessage: { tr: 'Türkçe VPN mesajı', en: 'English VPN message' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const error = await customFetch('/api/auth/network-check', { skipAuth: true }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiException);
    expect(error.code).toBe('VPN_NOT_ALLOWED');
    expect(detail).toEqual({ tr: 'Türkçe VPN mesajı', en: 'English VPN message' });
  });
});

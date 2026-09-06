import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withNativeBillingLock } from '../src/native/iap';

describe('system recovery hotfix', () => {
  it('serializes native billing operations so the shared Android BillingClient cannot race', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withNativeBillingLock(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
      return 1;
    });
    const second = withNativeBillingLock(async () => {
      events.push('second:start');
      events.push('second:end');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('continues the billing queue after a rejected native operation', async () => {
    await expect(withNativeBillingLock(async () => { throw new Error('store disconnected'); })).rejects.toThrow('store disconnected');
    await expect(withNativeBillingLock(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('uses the recurring non-zero Google Play phase instead of hiding trial products', () => {
    const patch = readFileSync(resolve(process.cwd(), 'patches/@capgo+native-purchases+7.19.3.patch'), 'utf8');
    expect(patch).toContain('displayPricingPhase');
    expect(patch).toContain('getPriceAmountMicros() > 0');
    expect(patch).not.toContain('+                            ProductDetails.PricingPhase firstPricingPhase');
  });
});

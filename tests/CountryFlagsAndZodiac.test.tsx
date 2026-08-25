import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { normalizeCountryCode } from '../src/lib/countryFlags';
import { AVAILABLE_FLAG_CODES, UNKNOWN_FLAG_CODE, getFlagAssetPath } from '../src/lib/flagAssets';
import { CountryFlagBadge } from '../src/components/ui/CountryFlagBadge';
import { ZodiacIcon, ZODIAC_ACCENT_CLASSES, type ZodiacSign } from '../src/components/ui/ZodiacIcon';
import { ZODIAC_LABELS } from '../src/lib/profileLabels';

describe('circular country flags', () => {
  it('normalizes loose input to ISO alpha-2 and resolves a vendored local asset', () => {
    expect(normalizeCountryCode('Türkiye')).toBe('TR');
    expect(normalizeCountryCode('usa')).toBe('US');
    expect(normalizeCountryCode('gb')).toBe('GB');
    for (const code of ['TR', 'US', 'GB', 'DE', 'FR', 'JP', 'BR', 'IN', 'AZ']) {
      expect(AVAILABLE_FLAG_CODES.has(code)).toBe(true);
      expect(getFlagAssetPath(code)).toBe(`/flags/${code.toLowerCase()}.svg`);
    }
  });

  it('renders a real ISO code as one circular <img>, never text or emoji', () => {
    const { container } = render(<CountryFlagBadge countryCode="TR" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/flags/tr.svg');
    expect(container.querySelector('span')?.className).toContain('rounded-full');
    expect(container.textContent).not.toMatch(/[🇦-🇿]/u);
  });

  it('falls back to the neutral unknown flag for a code outside the vendored set, not a wrong country', () => {
    expect(AVAILABLE_FLAG_CODES.has('ZZ' as string)).toBe(false);
    const { container } = render(<CountryFlagBadge countryCode="ZZ" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(getFlagAssetPath(UNKNOWN_FLAG_CODE));
  });

  it('renders nothing when there is no usable country data at all', () => {
    const { container } = render(<CountryFlagBadge countryCode={null} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('zodiac line icons', () => {
  const signs = Object.keys(ZODIAC_LABELS) as ZodiacSign[];

  it('covers exactly the 12 canonical signs', () => {
    expect(signs.sort()).toEqual(
      ['AQUARIUS', 'ARIES', 'CANCER', 'CAPRICORN', 'GEMINI', 'LEO', 'LIBRA', 'PISCES', 'SAGITTARIUS', 'SCORPIO', 'TAURUS', 'VIRGO']
    );
  });

  it.each(signs)('%s renders one drawn SVG (no emoji, no Unicode glyph)', (sign) => {
    const { container } = render(<ZodiacIcon sign={sign} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(container.querySelectorAll('path, circle, polyline').length).toBeGreaterThan(0);
    expect(container.textContent).toBe('');
    expect(ZODIAC_LABELS[sign]).not.toMatch(/[♈-♓]/u);
    expect(ZODIAC_ACCENT_CLASSES[sign]).toBeTruthy();
  });

  it('renders nothing for an unrecognized sign instead of a broken icon', () => {
    const { container } = render(<ZodiacIcon sign="NOT_A_SIGN" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { recorderBlob, selectSupportedAudioMimeType, stopMediaStream } from '../src/services/media/audioRecorder';

describe('Final Stability V7', () => {
  it('chooses the first WebView-supported audio MIME and preserves it in the blob', () => {
    const ctor = { isTypeSupported: vi.fn((mime: string) => mime === 'audio/webm') } as unknown as typeof MediaRecorder;
    expect(selectSupportedAudioMimeType(ctor)).toBe('audio/webm');
    const blob = recorderBlob([new Blob(['voice'], { type: 'audio/webm' })], { mimeType: 'audio/webm' } as MediaRecorder);
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to recorder output type and stops every media track', () => {
    const stopA = vi.fn(); const stopB = vi.fn();
    stopMediaStream({ getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream);
    expect(stopA).toHaveBeenCalledOnce(); expect(stopB).toHaveBeenCalledOnce();
  });

  it('keeps residence labels distinct from live map/GPS concepts in every locale', () => {
    const localeSource = fs.readFileSync(path.resolve('src/i18n/appLocale.ts'), 'utf8');
    const swipeSource = fs.readFileSync(path.resolve('src/features/discovery/SwipeCard.tsx'), 'utf8');
    expect(localeSource).toContain("profileCityLabel: 'Yaşadığın Yer'");
    expect(localeSource).toContain("profileResidenceOtherLabel: 'Yaşadığı Yer'");
    expect(localeSource).toContain("profileCityLabel: 'Lives in'");
    for (const label of ['Vive en', 'Vit à', 'Mora em', 'Живёт в', 'يقيم في', 'निवास स्थान', '居住在']) {
      expect(localeSource).toContain(`profileResidenceOtherLabel: '${label}'`);
    }
    expect(swipeSource).toContain("t('profileResidenceOtherLabel')");
    expect(localeSource).toContain("settingsShowOnMapLabel: 'Show on Map'");
  });
});

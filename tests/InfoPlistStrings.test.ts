import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appDir = resolve(__dirname, '..', 'ios', 'App', 'App');
const infoPlist = readFileSync(resolve(appDir, 'Info.plist'), 'utf8');
const pbxproj = readFileSync(resolve(appDir, '..', 'App.xcodeproj', 'project.pbxproj'), 'utf8');

const LOCALES = ['tr', 'en', 'es', 'fr', 'pt', 'ru', 'ar', 'hi', 'zh-Hans'];
const KEYS = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMicrophoneUsageDescription',
];

function parseStrings(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^"([^"]+)" = "((?:[^"\\]|\\.)*)";$/gm)) out[m[1]] = m[2];
  return out;
}

// Static validation only: prompts are not exercised on an iOS runtime here.
describe('localized iOS permission prompts', () => {
  it.each(LOCALES)('%s.lproj/InfoPlist.strings has every usage description', (locale) => {
    const strings = parseStrings(readFileSync(resolve(appDir, `${locale}.lproj`, 'InfoPlist.strings'), 'utf8'));
    expect(Object.keys(strings).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(strings[key].length).toBeGreaterThan(20);
  });

  it('base Info.plist matches the Turkish strings and no longer describes nearby profiles', () => {
    const tr = parseStrings(readFileSync(resolve(appDir, 'tr.lproj', 'InfoPlist.strings'), 'utf8'));
    for (const key of KEYS) expect(infoPlist).toContain(`<key>${key}</key>\n\t<string>${tr[key]}</string>`.replace(/\n/g, infoPlist.includes('\r\n') ? '\r\n' : '\n'));
    expect(infoPlist).not.toMatch(/Yakınınızdaki profilleri/);
    const en = parseStrings(readFileSync(resolve(appDir, 'en.lproj', 'InfoPlist.strings'), 'utf8'));
    expect(Object.values(en).join(' ')).not.toMatch(/nearby (people|profiles)|match/i);
  });

  it('every locale is bundled via the InfoPlist.strings variant group', () => {
    expect(pbxproj).toMatch(/InfoPlist\.strings in Resources \*\/,/);
    for (const locale of LOCALES) {
      expect(pbxproj).toContain(`path = ${locale}.lproj/InfoPlist.strings;`);
    }
    for (const locale of LOCALES) expect(infoPlist).toContain(`<string>${locale}</string>`);
  });
});

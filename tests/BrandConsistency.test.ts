import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function pngDimensions(path: string) {
  const png = readFileSync(resolve(root, path));
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('native brand consistency', () => {
  it('uses Ryvo as the only user-facing native app name', () => {
    const capacitor = read('capacitor.config.ts');
    const androidStrings = read('android/app/src/main/res/values/strings.xml');
    const androidManifest = read('android/app/src/main/AndroidManifest.xml');
    const iosInfo = read('ios/App/App/Info.plist');

    expect(capacitor).toContain("appName: 'Ryvo'");
    expect(androidStrings).toContain('<string name="app_name">Ryvo</string>');
    expect(androidStrings).toContain('<string name="title_activity_main">Ryvo</string>');
    expect(androidManifest.match(/android:label="@string\/app_name"/g)).toHaveLength(2);
    expect(iosInfo).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Ryvo<\/string>/);
    expect(iosInfo).toMatch(/<key>CFBundleName<\/key>\s*<string>Ryvo<\/string>/);
  });

  it('keeps one theme-independent iOS AppIcon artwork', () => {
    const contents = JSON.parse(
      read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'),
    );

    expect(contents.images).toEqual([
      {
        filename: 'AppIcon-512@2x.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
    ]);
    expect(pngDimensions('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
      .toEqual({ width: 1024, height: 1024 });
  });

  it('defines complete adaptive and legacy Android icon resources without themed switching', () => {
    const adaptiveXml = read('android/app/src/main/res/mipmap-anydpi-v26/launcher_icon.xml');
    expect(adaptiveXml).toContain('@drawable/ic_launcher_background');
    expect(adaptiveXml).toContain('@drawable/ic_launcher_foreground');
    expect(adaptiveXml).not.toContain('monochrome');

    const expected = {
      mdpi: { adaptive: 108, legacy: 48 },
      hdpi: { adaptive: 162, legacy: 72 },
      xhdpi: { adaptive: 216, legacy: 96 },
      xxhdpi: { adaptive: 324, legacy: 144 },
      xxxhdpi: { adaptive: 432, legacy: 192 },
    } as const;

    for (const [density, sizes] of Object.entries(expected)) {
      expect(pngDimensions(`android/app/src/main/res/drawable-${density}/ic_launcher_foreground.png`))
        .toEqual({ width: sizes.adaptive, height: sizes.adaptive });
      expect(pngDimensions(`android/app/src/main/res/drawable-${density}/ic_launcher_background.png`))
        .toEqual({ width: sizes.adaptive, height: sizes.adaptive });
      expect(pngDimensions(`android/app/src/main/res/mipmap-${density}/launcher_icon.png`))
        .toEqual({ width: sizes.legacy, height: sizes.legacy });
    }
  });
});

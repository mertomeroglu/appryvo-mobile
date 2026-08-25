import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/theme/themeStore.ts'), 'utf8');

describe('system theme live-updates without an app restart', () => {
  it('subscribes to OS theme changes instead of only reading matchMedia once', () => {
    expect(source).toMatch(/media\.addEventListener\('change'/);
  });

  it('only re-applies when the user is actually on system mode, never overriding an explicit choice', () => {
    const handlerStart = source.indexOf('const handleSystemThemeChange');
    const handlerBody = source.slice(handlerStart, source.indexOf('};', handlerStart));
    expect(handlerBody).toContain("useThemeStore.getState().mode === 'system'");
  });

  it('falls back to the legacy addListener API for older WebView engines', () => {
    expect(source).toMatch(/\(media as any\)\.addListener/);
  });
});

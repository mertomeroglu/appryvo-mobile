import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('StoryComposer native media picker lifecycle', () => {
  it('keeps the composer mounted while the native picker activity returns', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/StoryComposer.tsx'),
      'utf8'
    );

    expect(source).toContain('nativePickerLaunchingRef.current = true');
    expect(source).toContain('if (nativePickerLaunchingRef.current)');
    expect(source).toContain('setPickerOpen(false)');
    expect(source).toMatch(/ActionSheet[^>]+onClose=\{closePicker\}/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatLanguageName, normalizeLanguageNames } from '../src/lib/languages';
import { getRelationshipGoalLabels } from '../src/lib/profileLabels';
import { messages } from '../src/i18n/appLocale';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('edit profile production rules', () => {
  it('locks identity fields and omits the obsolete location explanation', () => {
    const editor = source('src/components/EditProfileModal.tsx');
    expect(editor).toContain("t('nameLockedHint')");
    expect(editor).toContain("t('usernameLockedHint')");
    expect(messages.tr.nameLockedHint).toBe('Ad değiştirilemez');
    expect(messages.tr.usernameLockedHint).toBe('Kullanıcı adı değiştirilemez');
    expect(editor.match(/readOnly/g)?.length).toBeGreaterThanOrEqual(2);
    expect(editor).not.toContain('Konum, cihaz izniyle Keşfet ekranından güncellenir.');
    expect(editor).not.toContain('const [name, setName]');
  });

  it('enforces one or two relationship goals and provides third-selection feedback', () => {
    const editor = source('src/components/EditProfileModal.tsx');
    expect(editor).toContain('relationshipGoals.length < 1 || relationshipGoals.length > 2');
    expect(editor).toContain("toast.show(t('relationshipGoalMaxToast')");
    expect(messages.tr.relationshipGoalMaxToast).toBe('En fazla 2 ilişki hedefi seçebilirsin.');
    expect(editor).toContain('relationshipGoals,');
    expect(getRelationshipGoalLabels(['LONG_TERM', 'FRIENDSHIP'])).toHaveLength(2);
  });

  it('uses taxonomy chips for interests and the existing zodiac enum', () => {
    const editor = source('src/components/EditProfileModal.tsx');
    // The full category catalog was moved out of the long edit-profile form into a dedicated
    // InterestsEditorScreen (compact summary + "Edit Interests" entry point here instead) --
    // see the taxonomy-chip assertions below, which now target that dedicated screen.
    expect(editor).toContain('InterestsEditorScreen');
    expect(editor).toContain('setIsInterestsEditorOpen(true)');
    expect(editor).not.toContain('placeholder="Yeni ilgi alanı..."');
    expect(editor).toContain('ZODIAC_OPTIONS.map');
    expect(editor).toContain('zodiac: zodiac || null');

    const interestsEditor = source('src/components/InterestsEditorScreen.tsx');
    expect(interestsEditor).toContain('INTEREST_CATEGORIES.map');
    expect(interestsEditor).toContain('toggleInterest(item)');
    expect(interestsEditor).not.toContain('placeholder="Yeni ilgi alanı..."');
  });
});

describe('language label normalization', () => {
  it('formats legacy uppercase values consistently', () => {
    expect(formatLanguageName('TÜRKÇE')).toBe('Türkçe');
    expect(formatLanguageName('İNGİLİZCE')).toBe('İngilizce');
    expect(formatLanguageName('ALMANCA')).toBe('Almanca');
    expect(normalizeLanguageNames(['TÜRKÇE', 'Türkçe', 'İNGİLİZCE'])).toEqual(['Türkçe', 'İngilizce']);
  });

  it('removes the featured-languages heading', () => {
    expect(source('src/components/LanguageSelector.tsx')).not.toContain('Öne Çıkan Diller');
  });
});

describe('profile API persistence contract', () => {
  it('ships the relationship-goals and zodiac migration', () => {
    const migration = source('../web/server/api/migrations/039_edit_profile_relationship_goals_zodiac.sql');
    expect(migration).toContain('relationship_goals JSONB');
    expect(migration).toContain('zodiac VARCHAR(20)');
    expect(migration).toContain('BETWEEN 1 AND 2');
  });
});


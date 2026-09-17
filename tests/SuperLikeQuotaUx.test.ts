import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { messages } from '../src/i18n/appLocale';
import { QUESTION_TRANSLATIONS } from '../src/features/questions/questionLocale';

// Super Like is no longer a discovery action: it exists only inside the question flow, as the
// second chance offered after a wrong answer (see QuestionAnswerSheet.tsx).
const source = fs.readFileSync(path.resolve('src/features/questions/QuestionAnswerSheet.tsx'), 'utf8');

describe('Super Like zero-quota UX', () => {
  it('uses a clear quota state instead of a generic error or silent redirect', () => {
    expect(source).toContain("code === 'SUPERLIKE_QUOTA_EXHAUSTED'");
    expect(source).toContain("setPhase({ kind: 'quota'");
    expect(source).toContain("qt('superlikeQuotaTitle')");
    expect(source).toContain("t('explorePlusGoldCta')");
    expect(QUESTION_TRANSLATIONS.tr.superlikeQuotaTitle).toBe('Super Like hakkın kalmadı');
    expect(messages.tr.explorePlusGoldCta).toBe("Plus ve Gold'u İncele");
  });

  it('keeps the rewarded-ad route, which is a real way to earn a Super Like', () => {
    // Unlike the retired swipe deck (where rewarded ads never applied to Super Likes), the
    // question flow deliberately keeps the rewarded Super Like economy as the free path out of
    // an exhausted quota, alongside the Plus/Gold upsell.
    expect(source).toContain('rewardType="REWARDED_SUPERLIKE"');
    expect(source).toContain("qt('watchAdForSuperlike')");
    expect(source).toContain("navigate('/premium')");
  });
});

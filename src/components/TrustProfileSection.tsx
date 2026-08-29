import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTrustProfileQuery } from '../hooks/useQueries';
import { useAppTranslation } from '../i18n/appLocale';
import { TRUST_CATEGORY_KEYS, getTrustCategoryLabel } from '../lib/trustLabels';

interface TrustProfileSectionProps {
  userId?: string | null;
}

/**
 * Public Trust Profile display -- aggregate-only, per the 4.3(b) remediation product rules:
 * never an individual review, never a reviewer identity, never shown below the server's
 * verified-meeting threshold (see GET /api/trust/profile/:userId in trust_controller.js).
 */
export const TrustProfileSection: React.FC<TrustProfileSectionProps> = ({ userId }) => {
  const { t, locale } = useAppTranslation();
  const { data: trust, isLoading } = useTrustProfileQuery(userId);

  if (!userId || isLoading || !trust) return null;

  return (
    <div className="bg-surface border border-app p-4 rounded-2xl space-y-3">
      <h4 className="flex items-center gap-1.5 text-micro text-app-muted uppercase tracking-wider">
        <ShieldCheck className="w-3.5 h-3.5 text-[#32D583]" />
        {t('trustProfileSectionLabel')}
      </h4>

      {trust.thresholdReached && trust.averages ? (
        <div className="space-y-2.5">
          {TRUST_CATEGORY_KEYS.map((key) => {
            const value = trust.averages![key];
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-medium text-app">{getTrustCategoryLabel(key, locale)}</span>
                  <span className="text-caption font-bold text-app shrink-0">{value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-app-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-gradient"
                    style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-body text-app-muted">{t('trustProfileEmptyState')}</p>
          <p className="text-micro text-app-muted">
            {t('trustProfileProgressTemplate').replace('{count}', String(trust.count)).replace('{threshold}', String(trust.threshold))}
          </p>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Compass, Search, MapPin, Check, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api/apiClient';
import { searchCities, type GeoCityResult } from '../../services/geo/cityService';
import { useEntitlementsQuery, useMeQuery } from '../../hooks/useQueries';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { toast } from '../../stores/useToastStore';
import { PASSPORT_LABELS, useAppLocaleStore, useAppTranslation } from '../../i18n/appLocale';

export const PassportScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<GeoCityResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activePassportCity, setActivePassportCity] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const locale = useAppLocaleStore((state) => state.locale);
  const passportLabel = PASSPORT_LABELS[locale];

  const { data: me, refetch: refetchMe } = useMeQuery();
  // The screen used to keep the active city in local state only, so reopening it forgot which
  // city you were teleported to. /api/me is the authority.
  const serverPassportCity = me?.locationMode === 'PASSPORT' ? (me?.passportCity || null) : null;
  const currentPassportCity = activePassportCity ?? serverPassportCity;

  // Search as you type rather than only on submit: the old form-submit-only flow was why
  // typing "fra" showed nothing until you pressed enter.
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) { setCities([]); setHasSearched(false); return; }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchCities(term)
        .then((results) => { if (!cancelled) { setCities(results); setSearchError(false); } })
        .catch(() => { if (!cancelled) { setCities([]); setSearchError(true); } })
        .finally(() => { if (!cancelled) { setIsSearching(false); setHasSearched(true); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

  const { data: entitlements, isLoading } = useEntitlementsQuery();
  const passportEnabled = entitlements?.passportEnabled === true;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(false);
    setHasSearched(true);
    try {
      const results = await searchCities(searchQuery);
      setCities(results);
    } catch {
      setCities([]);
      setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDisablePassport = async () => {
    setIsSaving(true);
    try {
      await apiClient.delete('/api/user/passport');
      setActivePassportCity(null);
      await refetchMe();
      toast.success(t('passportDisableAction'));
    } catch (err: any) {
      toast.error(err?.message || t('passportLocationUpdateFailedError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCity = async (city: GeoCityResult) => {
    if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return;
    setIsSaving(true);
    try {
      await apiClient.post('/api/user/passport', {
        latitude: city.latitude,
        longitude: city.longitude,
        city: city.city,
        country: city.country,
      });
      setActivePassportCity(city.city);
      void refetchMe();
      toast.success(t('passportTeleportedToastTemplate').replace('{city}', city.city));
    } catch (err: any) {
      toast.error(err.message || t('passportLocationUpdateFailedError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h3 className="text-heading text-app">{t('passportModeTitleTemplate').replace('{passport}', passportLabel)}</h3>
        <div className="w-9" />
      </header>

      <div className="flex flex-col items-center text-center my-4">
        <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center shadow-elevated shadow-purple-500/30 mb-3">
          <Compass className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-title text-app">{t('passportHeroTitle')}</h2>
        <p className="text-caption text-app-muted mt-1 max-w-xs leading-relaxed normal-case">
          {t('passportHeroDescription')}
        </p>
      </div>

      {isLoading ? (
        <div className="my-auto space-y-3 w-full max-w-md mx-auto">
          <Skeleton variant="card" className="h-40 rounded-3xl" />
        </div>
      ) : !passportEnabled ? (
        <div className="my-auto p-6 rounded-3xl bg-surface border border-app text-center space-y-4 shadow-soft">
          <PremiumBadgeInline />
          <p className="text-body font-extrabold text-app">{t('passportUnlockTitleTemplate').replace('{passport}', passportLabel)}</p>
          <p className="text-caption text-app-muted normal-case">
            {t('passportUnlockDescription')}
          </p>
          <AppButton variant="primary" size="lg" fullWidth onClick={() => navigate('/premium')}>
            {t('passportUpgradeAction')}
          </AppButton>
        </div>
      ) : (
        <>
          {currentPassportCity && (
            <div className="w-full max-w-md mx-auto mt-3 rounded-2xl border border-app bg-surface p-4 shadow-soft">
              <p className="text-caption font-bold text-app">
                {t('passportActiveLabelTemplate').replace('{city}', currentPassportCity)}
              </p>
              <AppButton variant="secondary" size="md" fullWidth loading={isSaving} onClick={handleDisablePassport} className="mt-3">
                {t('passportDisableAction')}
              </AppButton>
            </div>
          )}

          {/* Search Input */}
          <form onSubmit={handleSearch} className="relative w-full max-w-md mx-auto my-3">
            <Search className="absolute start-4 top-3.5 w-5 h-5 text-app-muted" />
            <input
              type="text"
              placeholder={t('passportSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-input-app border border-app rounded-full ps-12 pe-4 py-3 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/40"
            />
          </form>

          {/* Cities List */}
          <div className="space-y-2 my-2">
            {isSearching && (
              <p className="text-caption font-semibold text-app-muted text-center py-4">{t('mapSearchingLabel')}</p>
            )}
            {!isSearching && searchError && (
              <p className="text-caption font-semibold text-app-muted text-center py-4">{t('mapSearchErrorLabel')}</p>
            )}
            {!isSearching && !searchError && hasSearched && cities.length === 0 && (
              <p className="text-caption font-semibold text-app-muted text-center py-4">{t('passportNoCityResultsLabel')}</p>
            )}
            {!isSearching && !searchError && cities.map((city, idx) => {
              const isSelected = activePassportCity === city.city;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectCity(city)}
                  disabled={isSaving}
                  className={`w-full p-3.5 rounded-2xl bg-surface border flex items-center justify-between transition-colors ${
                    isSelected ? 'border-purple-500 bg-purple-500/10 shadow-soft' : 'border-app'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-purple-500" />
                    <div className="text-start">
                      <h4 className="text-body font-extrabold text-app">{city.city}</h4>
                      <span className="text-caption text-app-muted normal-case">{city.country}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-5 h-5 text-purple-500" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const PremiumBadgeInline: React.FC = () => (
  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#F5B942] to-[#FBD98A] mx-auto flex items-center justify-center shadow-premium">
    <Crown className="w-6 h-6 text-[#3A2A05]" fill="currentColor" />
  </div>
);

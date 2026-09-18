import React, { useEffect, useState } from 'react';
import { Check, Crown, LockKeyhole, ShieldCheck, Sparkles, SlidersHorizontal, Users, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEntitlementsQuery, useMeQuery, useUpdateProfileMutation, type MapGenderFilter } from '../hooks/useQueries';
import { RELATIONSHIP_GOAL_LABELS } from '../lib/profileLabels';
import { BottomSheet } from './ui/BottomSheet';
import { AppButton } from './ui/AppButton';
import { IconButton } from './ui/IconButton';
import { DualRangeSlider } from './ui/DualRangeSlider';
import { useAppTranslation, type AppMessageKey } from '../i18n/appLocale';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after preferences are saved so the caller can refetch the feed. */
  onApplied: () => void;
}

// The same four values, labels and fallback the map's filter row uses -- one preference
// (users.gender_filter), shown identically wherever it can be changed.
const GENDER_FILTERS: MapGenderFilter[] = ['ALL', 'FEMALE', 'MALE', 'OTHER'];
const GENDER_FILTER_LABEL_KEY: Record<MapGenderFilter, AppMessageKey> = {
  ALL: 'interestedInOptionEveryone',
  FEMALE: 'interestedInOptionFemale',
  MALE: 'interestedInOptionMale',
  OTHER: 'mapFilterOther',
};

/** Mirrors resolveMapGenderFilter in the API's discovery_engine.js. */
function resolveGenderFilter(saved?: string | null, registrationChoice?: string | null): MapGenderFilter {
  if (saved && GENDER_FILTERS.includes(saved as MapGenderFilter)) return saved as MapGenderFilter;
  if (registrationChoice === 'FEMALE' || registrationChoice === 'MALE') return registrationChoice;
  return 'ALL';
}

const DEFAULTS = {
  minAge: 18,
  maxAge: 45,
  verifiedOnly: false,
  recentlyActive: false,
  newMembers: false,
  relationshipGoal: null as string | null,
};

const ToggleChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  locked?: boolean;
}> = ({ icon, label, active, onClick, locked = false }) => {
  const { t } = useAppTranslation();
  return (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={locked ? undefined : active}
    aria-label={locked ? t('filterLockedAriaLabelTemplate').replace('{label}', label) : label}
    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-caption font-bold transition-colors ${
      locked
        ? 'border-gold/35 bg-gold/5 text-app-muted'
        : active ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
    }`}
  >
    {icon}
    <span>{label}</span>
    {locked ? <LockKeyhole className="ms-auto h-3.5 w-3.5 shrink-0 text-gold" /> : active && <Check className="w-3.5 h-3.5 ms-auto shrink-0" />}
  </button>
  );
};

export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({ isOpen, onClose, onApplied }) => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { data: me } = useMeQuery();
  const { data: entitlements } = useEntitlementsQuery();
  const updateProfile = useUpdateProfileMutation();
  const hasAdvancedFilters = entitlements?.advancedFilters === true;

  const [minAge, setMinAge] = useState(DEFAULTS.minAge);
  const [maxAge, setMaxAge] = useState(DEFAULTS.maxAge);
  const [verifiedOnly, setVerifiedOnly] = useState(DEFAULTS.verifiedOnly);
  const [recentlyActive, setRecentlyActive] = useState(DEFAULTS.recentlyActive);
  const [newMembers, setNewMembers] = useState(DEFAULTS.newMembers);
  const [relationshipGoal, setRelationshipGoal] = useState<string | null>(DEFAULTS.relationshipGoal);
  const [genderFilter, setGenderFilter] = useState<MapGenderFilter>('ALL');
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize from the user's saved preferences -- every field here maps to a real, persisted
  // backend column and is actually enforced server-side (server/api/src/discovery_engine.js),
  // never a client-only cosmetic filter.
  useEffect(() => {
    if (!me) return;
    const savedMinAge = Math.max(18, Math.min(99, me.minAgePref ?? DEFAULTS.minAge));
    const savedMaxAge = Math.max(savedMinAge, Math.min(99, me.maxAgePref ?? DEFAULTS.maxAge));
    setMinAge(savedMinAge);
    setMaxAge(savedMaxAge);
    setVerifiedOnly(hasAdvancedFilters ? me.verifiedOnlyPref ?? DEFAULTS.verifiedOnly : false);
    setRecentlyActive(hasAdvancedFilters ? me.recentlyActivePref ?? DEFAULTS.recentlyActive : false);
    setNewMembers(hasAdvancedFilters ? me.newMembersPref ?? DEFAULTS.newMembers : false);
    setRelationshipGoal(hasAdvancedFilters ? me.discoveryRelationshipGoalPref ?? DEFAULTS.relationshipGoal : null);
    // Not gated behind Premium: this is "who am I even looking for", the same answer given at
    // registration, not an advanced narrowing filter.
    setGenderFilter(resolveGenderFilter(me.genderFilter, me.targetGender));
  }, [hasAdvancedFilters, me]);

  const openPremiumUpsell = () => {
    onClose();
    navigate('/premium');
  };

  const handleApply = async () => {
    setErrorMsg('');
    try {
      await updateProfile.mutateAsync({
        minAgePref: minAge,
        maxAgePref: maxAge,
        verifiedOnlyPref: hasAdvancedFilters ? verifiedOnly : false,
        recentlyActivePref: hasAdvancedFilters ? recentlyActive : false,
        newMembersPref: hasAdvancedFilters ? newMembers : false,
        discoveryRelationshipGoalPref: hasAdvancedFilters ? relationshipGoal : null,
        genderFilter,
      });
      onApplied();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || t('filterSaveFailedError'));
    }
  };

  const handleReset = () => {
    setMinAge(DEFAULTS.minAge);
    setMaxAge(DEFAULTS.maxAge);
    setVerifiedOnly(DEFAULTS.verifiedOnly);
    setRecentlyActive(DEFAULTS.recentlyActive);
    setNewMembers(DEFAULTS.newMembers);
    setRelationshipGoal(DEFAULTS.relationshipGoal);
    setGenderFilter('ALL');
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-5 pb-6 space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between border-b border-app pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-app-muted" />
            <h3 className="text-heading text-app">{t('filterSearchFiltersTitle')}</h3>
          </div>
          <IconButton aria-label={t('closeAriaLabel')} variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Who to show. Shared with the map's own filter row and persisted on the profile
            (users.gender_filter), so a choice made here is the choice there, and it survives
            closing the app. 'Diğer' is the gender, not "no preference" -- that is 'Herkes'. */}
        <div className="space-y-2">
          <p className="text-caption font-bold text-app">{t('filterShowMeLabel')}</p>
          <div className="grid grid-cols-2 gap-2">
            {GENDER_FILTERS.map((value) => (
              <ToggleChip
                key={value}
                icon={<Users className="w-4 h-4" />}
                label={t(GENDER_FILTER_LABEL_KEY[value])}
                active={genderFilter === value}
                onClick={() => setGenderFilter(value)}
              />
            ))}
          </div>
        </div>

        {/* Age range */}
        <DualRangeSlider min={18} max={99} valueMin={minAge} valueMax={maxAge} onChange={(a, b) => { setMinAge(a); setMaxAge(b); }} />

        {/* Paid, server-enforced discovery filters. Base age filtering remains free. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption font-semibold text-app-muted">{t('filterAdvancedFiltersLabel')}</span>
            {!hasAdvancedFilters && (
              <button type="button" onClick={openPremiumUpsell} className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-micro font-extrabold text-gold">
                <Crown className="h-3.5 w-3.5" /> {t('premium')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <ToggleChip
              icon={<ShieldCheck className="w-4 h-4" />}
              label={t('filterVerifiedOnlyLabel')}
              active={verifiedOnly}
              locked={!hasAdvancedFilters}
              onClick={hasAdvancedFilters ? () => setVerifiedOnly((v) => !v) : openPremiumUpsell}
            />
            <ToggleChip
              icon={<Zap className="w-4 h-4" />}
              label={t('filterRecentlyActiveLabel')}
              active={recentlyActive}
              locked={!hasAdvancedFilters}
              onClick={hasAdvancedFilters ? () => setRecentlyActive((v) => !v) : openPremiumUpsell}
            />
            <ToggleChip
              icon={<Sparkles className="w-4 h-4" />}
              label={t('filterNewMembersLabel')}
              active={newMembers}
              locked={!hasAdvancedFilters}
              onClick={hasAdvancedFilters ? () => setNewMembers((v) => !v) : openPremiumUpsell}
            />
          </div>
        </div>

        {/* Relationship goal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-app-muted">{t('filterRelationshipGoalLabel')}</span>
            {!hasAdvancedFilters && <LockKeyhole className="h-3.5 w-3.5 text-gold" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={hasAdvancedFilters ? () => setRelationshipGoal(null) : openPremiumUpsell}
              className={`px-3.5 py-2 rounded-xl border text-caption font-bold ${
                !hasAdvancedFilters ? 'border-gold/35 bg-gold/5 text-app-muted' : relationshipGoal === null ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
              }`}
            >
              {t('filterAnyGoalLabel')} {!hasAdvancedFilters && <LockKeyhole className="ms-1 inline h-3 w-3 text-gold" />}
            </button>
            {Object.entries(RELATIONSHIP_GOAL_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={hasAdvancedFilters ? () => setRelationshipGoal(key) : openPremiumUpsell}
                className={`px-3.5 py-2 rounded-xl border text-caption font-bold ${
                  !hasAdvancedFilters ? 'border-gold/35 bg-gold/5 text-app-muted' : relationshipGoal === key ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
                }`}
              >
                {label} {!hasAdvancedFilters && <LockKeyhole className="ms-1 inline h-3 w-3 text-gold" />}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
            {errorMsg}
          </div>
        )}

        <div className="flex gap-3 pt-2 sticky bottom-0 bg-surface pb-1">
          <AppButton variant="secondary" size="md" className="flex-1" onClick={handleReset}>
            {t('filterResetButton')}
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            className="flex-1"
            loading={updateProfile.isPending}
            leftIcon={<Check className="w-4 h-4" />}
            onClick={handleApply}
          >
            {t('filterApplyButton')}
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};

import React, { useEffect, useState } from 'react';
import { Check, ShieldCheck, Sparkles, SlidersHorizontal, X, Zap } from 'lucide-react';
import { useMeQuery, useUpdateProfileMutation } from '../hooks/useQueries';
import { RELATIONSHIP_GOAL_LABELS } from '../lib/profileLabels';
import { BottomSheet } from './ui/BottomSheet';
import { AppButton } from './ui/AppButton';
import { IconButton } from './ui/IconButton';
import { DualRangeSlider } from './ui/DualRangeSlider';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after preferences are saved so the caller can refetch the feed. */
  onApplied: () => void;
}

const DEFAULTS = {
  maxDistance: 50,
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
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-caption font-bold transition-colors ${
      active ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
    }`}
  >
    {icon}
    <span>{label}</span>
    {active && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
  </button>
);

export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({ isOpen, onClose, onApplied }) => {
  const { data: me } = useMeQuery();
  const updateProfile = useUpdateProfileMutation();

  const [maxDistance, setMaxDistance] = useState(DEFAULTS.maxDistance);
  const [minAge, setMinAge] = useState(DEFAULTS.minAge);
  const [maxAge, setMaxAge] = useState(DEFAULTS.maxAge);
  const [verifiedOnly, setVerifiedOnly] = useState(DEFAULTS.verifiedOnly);
  const [recentlyActive, setRecentlyActive] = useState(DEFAULTS.recentlyActive);
  const [newMembers, setNewMembers] = useState(DEFAULTS.newMembers);
  const [relationshipGoal, setRelationshipGoal] = useState<string | null>(DEFAULTS.relationshipGoal);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize from the user's saved preferences -- every field here maps to a real, persisted
  // backend column and is actually enforced server-side (server/api/src/discovery_engine.js),
  // never a client-only cosmetic filter.
  useEffect(() => {
    if (!me) return;
    setMaxDistance(me.maxDistancePref ?? DEFAULTS.maxDistance);
    setMinAge(me.minAgePref ?? DEFAULTS.minAge);
    setMaxAge(me.maxAgePref ?? DEFAULTS.maxAge);
    setVerifiedOnly(me.verifiedOnlyPref ?? DEFAULTS.verifiedOnly);
    setRecentlyActive(me.recentlyActivePref ?? DEFAULTS.recentlyActive);
    setNewMembers(me.newMembersPref ?? DEFAULTS.newMembers);
    setRelationshipGoal(me.discoveryRelationshipGoalPref ?? DEFAULTS.relationshipGoal);
  }, [me]);

  const handleApply = async () => {
    setErrorMsg('');
    try {
      await updateProfile.mutateAsync({
        minAgePref: minAge,
        maxAgePref: maxAge,
        maxDistancePref: maxDistance,
        verifiedOnlyPref: verifiedOnly,
        recentlyActivePref: recentlyActive,
        newMembersPref: newMembers,
        discoveryRelationshipGoalPref: relationshipGoal,
      });
      onApplied();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Filtreler kaydedilemedi.');
    }
  };

  const handleReset = () => {
    setMaxDistance(DEFAULTS.maxDistance);
    setMinAge(DEFAULTS.minAge);
    setMaxAge(DEFAULTS.maxAge);
    setVerifiedOnly(DEFAULTS.verifiedOnly);
    setRecentlyActive(DEFAULTS.recentlyActive);
    setNewMembers(DEFAULTS.newMembers);
    setRelationshipGoal(DEFAULTS.relationshipGoal);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-5 pb-6 space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between border-b border-app pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-app-muted" />
            <h3 className="text-heading text-app">Arama Filtreleri</h3>
          </div>
          <IconButton aria-label="Kapat" variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Distance */}
        <div className="space-y-2">
          <div className="flex justify-between text-caption font-semibold">
            <span className="text-app-muted">Maksimum Mesafe</span>
            <span className="text-pink-500 font-bold">{maxDistance} km</span>
          </div>
          <input
            type="range"
            min={1}
            max={150}
            value={maxDistance}
            onChange={(e) => setMaxDistance(Number(e.target.value))}
            className="w-full accent-pink-500"
          />
        </div>

        {/* Age range */}
        <DualRangeSlider min={18} max={80} valueMin={minAge} valueMax={maxAge} onChange={(a, b) => { setMinAge(a); setMaxAge(b); }} />

        {/* Real backend-enforced discovery filters */}
        <div className="space-y-2">
          <span className="text-caption font-semibold text-app-muted">Kime Öncelik Verelim</span>
          <div className="grid grid-cols-1 gap-2">
            <ToggleChip
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Sadece doğrulanmış profiller"
              active={verifiedOnly}
              onClick={() => setVerifiedOnly((v) => !v)}
            />
            <ToggleChip
              icon={<Zap className="w-4 h-4" />}
              label="Şu an aktif olanlar"
              active={recentlyActive}
              onClick={() => setRecentlyActive((v) => !v)}
            />
            <ToggleChip
              icon={<Sparkles className="w-4 h-4" />}
              label="Yeni üyeler"
              active={newMembers}
              onClick={() => setNewMembers((v) => !v)}
            />
          </div>
        </div>

        {/* Relationship goal */}
        <div className="space-y-2">
          <span className="text-caption font-semibold text-app-muted">İlişki Hedefi</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRelationshipGoal(null)}
              className={`px-3.5 py-2 rounded-xl border text-caption font-bold ${
                relationshipGoal === null ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
              }`}
            >
              Fark etmez
            </button>
            {Object.entries(RELATIONSHIP_GOAL_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRelationshipGoal(key)}
                className={`px-3.5 py-2 rounded-xl border text-caption font-bold ${
                  relationshipGoal === key ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app-muted'
                }`}
              >
                {label}
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
            Sıfırla
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            className="flex-1"
            loading={updateProfile.isPending}
            leftIcon={<Check className="w-4 h-4" />}
            onClick={handleApply}
          >
            Uygula
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};

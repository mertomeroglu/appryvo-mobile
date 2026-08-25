import React, { useState } from 'react';
import { ArrowLeft, Compass, Search, MapPin, Check, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api/apiClient';
import { useEntitlementsQuery } from '../../hooks/useQueries';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { toast } from '../../stores/useToastStore';
import { PASSPORT_LABELS, useAppLocaleStore } from '../../i18n/appLocale';

export const PassportScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<any[]>([]);
  const [activePassportCity, setActivePassportCity] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const locale = useAppLocaleStore((state) => state.locale);
  const passportLabel = PASSPORT_LABELS[locale];

  const { data: entitlements, isLoading } = useEntitlementsQuery();
  const passportEnabled = entitlements?.passportEnabled === true;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await apiClient.get(`/api/geo/search-cities?query=${encodeURIComponent(searchQuery)}`);
      setCities(res?.data || []);
    } catch {
      setCities([]);
    }
  };

  const handleSelectCity = async (city: any) => {
    if (typeof city.lat !== 'number' || typeof city.lng !== 'number') return;
    setIsSaving(true);
    try {
      await apiClient.post('/api/user/passport', {
        latitude: city.lat,
        longitude: city.lng,
        city: city.name,
        country: city.country,
      });
      setActivePassportCity(city.name);
      toast.success(`${city.name} konumuna ışınlandın`);
    } catch (err: any) {
      toast.error(err.message || 'Konum güncellenemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h3 className="text-heading text-app">{passportLabel} Modu</h3>
        <div className="w-9" />
      </header>

      <div className="flex flex-col items-center text-center my-4">
        <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center shadow-elevated shadow-purple-500/30 mb-3">
          <Compass className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-title text-app">Dünyanın Her Yerinde Işınlan</h2>
        <p className="text-caption text-app-muted mt-1 max-w-xs leading-relaxed normal-case">
          İstediğin şehri seçerek oradaki profilleri keşfetmeye başla.
        </p>
      </div>

      {isLoading ? (
        <div className="my-auto space-y-3 w-full max-w-md mx-auto">
          <Skeleton variant="card" className="h-40 rounded-3xl" />
        </div>
      ) : !passportEnabled ? (
        <div className="my-auto p-6 rounded-3xl bg-surface border border-app text-center space-y-4 shadow-soft">
          <PremiumBadgeInline />
          <p className="text-body font-extrabold text-app">{passportLabel}, Ryvo Plus ve Gold ile açılır</p>
          <p className="text-caption text-app-muted normal-case">
            Ryvo Plus ve Gold üyeleri konumlarını değiştirip dünyanın her yerinden insanlarla eşleşebilir.
          </p>
          <AppButton variant="primary" size="lg" fullWidth onClick={() => navigate('/premium')}>
            Ryvo Plus veya Gold’a Geç
          </AppButton>
        </div>
      ) : (
        <>
          {/* Search Input */}
          <form onSubmit={handleSearch} className="relative w-full max-w-md mx-auto my-3">
            <Search className="absolute start-4 top-3.5 w-5 h-5 text-app-muted" />
            <input
              type="text"
              placeholder="Hedef şehir ara (örn. Paris, Tokyo...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-input-app border border-app rounded-full ps-12 pe-4 py-3 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/40"
            />
          </form>

          {/* Cities List */}
          <div className="space-y-2 my-2">
            {cities.map((city: any, idx: number) => {
              const isSelected = activePassportCity === city.name;
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
                      <h4 className="text-body font-extrabold text-app">{city.name}</h4>
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

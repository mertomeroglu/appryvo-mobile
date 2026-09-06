import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { communityRoomsService, type RoomCategory } from '../../services/rooms/communityRoomsService';
import { searchCities, type GeoCityResult } from '../../services/geo/cityService';
import { useAppTranslation } from '../../i18n/appLocale';
import { roomsText } from './roomsLocale';
import { AppButton } from '../../components/ui/AppButton';

// V3: rooms are always TEXT (no live voice/video room type picker any more).
const CATEGORIES: RoomCategory[] = ['GENERAL', 'TRAVEL', 'FOOD_CAFE', 'MUSIC', 'MOVIES', 'GAMING', 'TECHNOLOGY', 'LOCAL', 'LANGUAGE', 'OTHER'];
const CATEGORY_KEY: Record<RoomCategory, Parameters<typeof roomsText>[1]> = {
  GENERAL: 'categoryGeneral', TRAVEL: 'categoryTravel', FOOD_CAFE: 'categoryFoodCafe', MUSIC: 'categoryMusic',
  MOVIES: 'categoryMovies', GAMING: 'categoryGaming', TECHNOLOGY: 'categoryTechnology', LOCAL: 'categoryLocal',
  LANGUAGE: 'categoryLanguage', OTHER: 'categoryOther',
};

export const CreateRoomScreen: React.FC = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { locale } = useAppTranslation();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<RoomCategory>('GENERAL');
  const [language, setLanguage] = useState(locale);
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState<GeoCityResult[]>([]);
  const [city, setCity] = useState<GeoCityResult | null>(null);
  const [max, setMax] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [creationCost, setCreationCost] = useState(100);

  useEffect(() => {
    communityRoomsService.config().then((config) => setCreationCost(config.creationCostCoins)).catch((error) => console.warn('[COMMUNITY ROOM] config load failed', error));
  }, []);

  const submit = async () => {
    const cityId = city?.id || Number(sp.get('cityId'));
    if (!cityId) { setError(roomsText(locale, 'city')); return; }
    setLoading(true);
    setError('');
    try {
      const room = await communityRoomsService.create({ title, topic, category, language, cityId, maxParticipants: max, idempotencyKey });
      setIdempotencyKey(crypto.randomUUID());
      navigate(`/rooms/${room.id}`, { replace: true });
    } catch (e: any) {
      setError(e?.code || e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-app px-4 pb-10 pt-safe text-app">
      <header className="mt-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-heading">{roomsText(locale, 'createRoom')}</h1>
      </header>
      <main className="mx-auto mt-6 max-w-md space-y-5">
        <p className="rounded-2xl border border-pink-500/20 bg-pink-500/10 p-4 text-caption text-app-muted">
          <MapPin className="me-2 inline h-4 w-4 text-pink-500" />{roomsText(locale, 'createHint')}
        </p>
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-caption font-bold text-amber-600">{creationCost} Ryvo Coin</p>
        <label className="block text-caption font-bold">
          {roomsText(locale, 'title')}
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-app bg-surface px-4" />
        </label>
        <label className="block text-caption font-bold">
          {roomsText(locale, 'topic')}
          <textarea value={topic} maxLength={280} onChange={(e) => setTopic(e.target.value)} className="mt-2 h-24 w-full resize-none rounded-2xl border border-app bg-surface p-4" />
        </label>
        <div>
          <span className="text-caption font-bold">{roomsText(locale, 'category')}</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-2xl border p-3 text-caption font-extrabold ${category === c ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface'}`}
              >
                {roomsText(locale, CATEGORY_KEY[c])}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-caption font-bold">
          {roomsText(locale, 'language')}
          <select value={language} onChange={(e) => setLanguage(e.target.value as any)} className="mt-2 h-12 w-full rounded-2xl border border-app bg-surface px-4">
            {['tr', 'en', 'es', 'fr', 'pt', 'ru', 'ar', 'hi', 'zh'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="block text-caption font-bold">
          {roomsText(locale, 'city')}
          <input
            value={city?.city || cityQuery}
            onChange={(e) => { setCity(null); setCityQuery(e.target.value); searchCities(e.target.value).then(setCities); }}
            className="mt-2 h-12 w-full rounded-2xl border border-app bg-surface px-4"
          />
        </label>
        {!city && cities.length > 0 && (
          <div className="-mt-4 overflow-hidden rounded-2xl border border-app bg-surface shadow-elevated">
            {cities.map((c) => (
              <button key={`${c.id}-${c.city}`} onClick={() => { setCity(c); setCities([]); }} className="block w-full border-b border-app px-4 py-3 text-start last:border-0">
                {c.city}, {c.country}
              </button>
            ))}
          </div>
        )}
        <label className="block text-caption font-bold">
          {roomsText(locale, 'maxParticipants')} ({max})
          <input type="range" min="2" max="100" value={max} onChange={(e) => setMax(Number(e.target.value))} className="mt-2 w-full accent-pink-500" />
        </label>
        {error && <p className="text-caption font-bold text-red-500">{error}</p>}
        <AppButton fullWidth loading={loading} disabled={title.trim().length < 3 || !topic.trim()} onClick={submit}>
          {roomsText(locale, 'create')}
        </AppButton>
      </main>
    </div>
  );
};
export default CreateRoomScreen;

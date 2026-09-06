import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Plus, Search, Users } from 'lucide-react';
import { communityRoomsService, type CommunityRoom, type RoomCategory } from '../../services/rooms/communityRoomsService';
import { useAppTranslation } from '../../i18n/appLocale';
import { roomsText } from './roomsLocale';
import { Avatar } from '../../components/ui/Avatar';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usefulRoomSubtitle } from './roomTitle';

// V3: rooms are always TEXT now, so the directory filters by category (not room type any more --
// see CreateRoomScreen.tsx / SocialMapScreen.tsx for the same category taxonomy).
const CATEGORY_KEY: Record<RoomCategory, Parameters<typeof roomsText>[1]> = {
  GENERAL: 'categoryGeneral', TRAVEL: 'categoryTravel', FOOD_CAFE: 'categoryFoodCafe', MUSIC: 'categoryMusic',
  MOVIES: 'categoryMovies', GAMING: 'categoryGaming', TECHNOLOGY: 'categoryTechnology', LOCAL: 'categoryLocal',
  LANGUAGE: 'categoryLanguage', OTHER: 'categoryOther',
};
const CATEGORIES: RoomCategory[] = ['GENERAL', 'TRAVEL', 'FOOD_CAFE', 'MUSIC', 'MOVIES', 'GAMING', 'TECHNOLOGY', 'LOCAL', 'LANGUAGE', 'OTHER'];

export const RoomDirectoryScreen: React.FC = () => {
  const { cityId } = useParams();
  const navigate = useNavigate();
  const { locale } = useAppTranslation();
  const [rooms, setRooms] = useState<CommunityRoom[]>([]);
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RoomCategory | ''>('');

  useEffect(() => {
    if (!cityId) return;
    communityRoomsService.city(Number(cityId)).then((r) => { setCity(r.city.name); setRooms(r.rooms); });
  }, [cityId]);

  const visible = useMemo(
    () => rooms.filter((r) => (!category || r.category === category) && (!query || `${r.title} ${r.topic}`.toLowerCase().includes(query.toLowerCase()))),
    [rooms, category, query]
  );
  const title = city || roomsText(locale, 'cityRooms');
  const subtitle = usefulRoomSubtitle(title, roomsText(locale, 'cityRooms'));

  return (
    <div className="min-h-full bg-app pb-28 text-app">
      <div className="sticky top-0 z-sticky border-b border-app bg-surface-95 pb-4 backdrop-blur-xl">
        <ScreenHeader
          transparent
          leading={<button onClick={() => navigate('/map')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><ArrowLeft className="h-5 w-5" /></button>}
          title={<div><h1 className="truncate text-heading">{title}</h1>{subtitle && <p className="truncate text-caption font-normal text-app-muted">{subtitle}</p>}</div>}
          trailing={<button onClick={() => navigate(`/rooms/create?cityId=${cityId || ''}`)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white"><Plus className="h-5 w-5" /></button>}
        />
        <div className="relative mx-4 mt-2">
          <Search className="pointer-events-none absolute start-4 top-3.5 z-10 h-5 w-5 text-app-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={roomsText(locale, 'searchRooms')} className="h-12 w-full rounded-2xl border border-app bg-app-secondary ps-12 pe-4 outline-none focus:border-pink-500" />
        </div>
        <div className="mx-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setCategory('')} className={`shrink-0 rounded-full px-4 py-2 text-caption font-bold ${category === '' ? 'bg-brand-gradient text-white' : 'border border-app bg-surface text-app-muted'}`}>
            {roomsText(locale, 'filterAll')}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-4 py-2 text-caption font-bold ${category === c ? 'bg-brand-gradient text-white' : 'border border-app bg-surface text-app-muted'}`}>
              {roomsText(locale, CATEGORY_KEY[c])}
            </button>
          ))}
        </div>
      </div>
      <main className="space-y-3 p-4">
        {visible.map((room) => (
          <button key={room.id} onClick={() => navigate(`/rooms/${room.id}`)} className="w-full rounded-[24px] border border-app bg-surface p-4 text-start shadow-soft active:scale-[.99]">
            <div className="flex gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 text-white"><MessageCircle className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-body font-extrabold">{room.title}</h2>
                  {room.isDemo && <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-black text-amber-500">{roomsText(locale, 'officialDemo')}</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-caption text-app-muted">{room.topic}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex -space-x-2">{room.participants.slice(0, 4).map((p) => <Avatar key={p.id} src={p.photoUrl} name={p.name} size="xs" className="rounded-full border-2 border-surface" />)}</div>
              <span className="flex items-center gap-1 text-caption font-bold text-app-muted"><Users className="h-4 w-4" />{room.activeParticipantCount}/{room.maxParticipants}</span>
            </div>
          </button>
        ))}
        {visible.length === 0 && <p className="py-20 text-center text-app-muted">{roomsText(locale, 'noRooms')}</p>}
      </main>
    </div>
  );
};
export default RoomDirectoryScreen;

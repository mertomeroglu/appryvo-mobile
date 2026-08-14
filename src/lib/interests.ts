// Controlled interest taxonomy for onboarding/profile editing. No custom/free-text tags are
// allowed — this keeps every profile's interests consistent and searchable. Each entry already
// carries its emoji baked into the label (the exact string stored on the profile and shown
// everywhere interests are rendered), matching the free-form `users.interests` JSONB column on
// the backend (no schema change needed to expand this list further later).

export interface InterestCategory {
  id: string;
  title: string;
  interests: string[];
}

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: 'music',
    title: 'Müzik & Gece Hayatı',
    interests: [
      '🎵 Müzik', '🎧 Elektronik Müzik', '🎛️ Techno', '🪩 Rave / Club', '🎤 Konser',
      '🎸 Rock', '🎹 Indie', '🎙️ Hip-Hop', '🎶 Pop', '🎷 Jazz', '🎼 Klasik',
      '🕺 Gece Hayatı', '🍸 Kokteyl Mekanları', '🎉 Festival',
    ],
  },
  {
    id: 'culture',
    title: 'Sinema & Kültür',
    interests: [
      '🎬 Sinema', '📺 Diziler', '🎭 Tiyatro', '🎨 Sanat', '🏛️ Müze', '📚 Kitap',
      '✍️ Yazarlık', '📖 Şiir', '🎞️ Bağımsız Filmler', '😂 Komedi', '🎌 Anime',
    ],
  },
  {
    id: 'travel',
    title: 'Seyahat & Doğa',
    interests: [
      '✈️ Seyahat', '🏕️ Kamp', '🥾 Hiking', '🏖️ Sahil', '🌿 Doğa', '🚗 Road Trip',
      '🏔️ Dağlar', '🌍 Yeni Kültürler', '🧳 Weekend Getaway', '🌅 Gün Batımı',
    ],
  },
  {
    id: 'food',
    title: 'Yeme & İçme',
    interests: [
      '☕ Kahve', '🍕 Pizza', '🍣 Sushi', '🍝 İtalyan Mutfağı', '🌮 Sokak Lezzetleri',
      '🍳 Brunch', '🍰 Tatlı', '🧑‍🍳 Yemek Yapmak', '🍵 Çay', '🥗 Sağlıklı Beslenme',
    ],
  },
  {
    id: 'sport',
    title: 'Spor & Wellness',
    interests: [
      '🏋️ Fitness', '🏃 Koşu', '⚽ Futbol', '🏀 Basketbol', '🎾 Tenis', '🏊 Yüzme',
      '🚴 Bisiklet', '🧘 Yoga', '🥊 Boks', '🏄 Su Sporları', '🎿 Kayak', '💪 Gym',
    ],
  },
  {
    id: 'creative',
    title: 'Yaratıcılık & Teknoloji',
    interests: [
      '📷 Fotoğrafçılık', '🎥 Video', '🎨 Tasarım', '💻 Teknoloji', '🤖 Yapay Zeka',
      '🎮 Oyun', '🕹️ Retro Oyun', '🎧 Podcast', '🎹 Müzik Üretimi', '🧑‍💻 Kodlama',
    ],
  },
  {
    id: 'social',
    title: 'Sosyal & Yaşam Tarzı',
    interests: [
      '🐾 Evcil Hayvanlar', '🐶 Köpekler', '🐱 Kediler', '💃 Dans', '🪩 Clubbing',
      '🎉 Partiler', '🧑‍🤝‍🧑 Arkadaşlarla Takılmak', '🧠 Kişisel Gelişim',
      '♟️ Masa Oyunları', '🎲 Board Games', '🚘 Arabalar', '🏍️ Motosiklet',
    ],
  },
];

export const ALL_INTERESTS: string[] = INTEREST_CATEGORIES.flatMap((c) => c.interests);

export const INTEREST_MIN = 3;
export const INTEREST_MAX = 8;

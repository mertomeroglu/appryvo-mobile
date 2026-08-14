// Bundled, app-compatible copy of Ryvo's canonical legal pages. The live pages
// (https://appryvo.online/privacy-policy, /terms-of-service) send `X-Frame-Options: SAMEORIGIN`,
// so they can't be embedded in an in-app WebView/iframe from the Capacitor origin -- per policy
// we don't weaken those headers just to allow framing. Instead this is a faithful transcription
// of the live content (verified against the deployed pages), used to render a native-feeling
// legal viewer. The website remains the source of truth; keep this in sync if it changes there.

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDocument {
  title: string;
  updatedLabel: string;
  sourceUrl: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Gizlilik Politikası',
  updatedLabel: 'Son Güncelleme: 10 Ağustos 2026',
  sourceUrl: 'https://appryvo.online/privacy-policy',
  sections: [
    {
      title: '1. Genel Bilgilendirme ve Kapsam',
      body: 'Ryvo ("Platform"), kullanıcılarının gizliliğine ve kişisel verilerinin korunmasına en yüksek derecede önem verir. İşbu Gizlilik Politikası, Ryvo mobil uygulaması ve ilgili hizmetleri kullandığınızda kişisel verilerinizin nasıl toplandığını, işlendiğini, saklandığını ve korunduğunu açıklamaktadır.',
    },
    {
      title: '2. Toplanan Veriler ve Kullanım Amaçları',
      body: 'Hizmet kalitemizi sağlamak ve güvenli bir sosyal keşif ortamı sunmak amacıyla aşağıdaki veri kategorileri işlenmektedir:\n\n• Hesap Bilgileri: Ad, soyad, kullanıcı adı, e-posta adresi, doğum tarihi ve cinsiyet bilgileri.\n• Profil İçerikleri: Profil fotoğrafları, biyografi metinleri ve seçtiğiniz ilgi alanları.\n• Konum Bilgileri: Yakındaki kullanıcılarla eşleşmenizi sağlamak amacıyla açık rızanızla toplanan anlık cihaz konum verisi.\n• Biyometrik Canlılık Doğrulaması: Sahte profilleri engellemek amacıyla gerçekleştirilen yüz doğrulama matematiksel veri özetleri (ham biyometrik veri saklanmaz).\n• İletişim Verileri: Uygulama içi mesajlaşma, sesli ve görüntülü görüşme sinyalleşme verileri.',
    },
    {
      title: '3. Veri Güvenliği ve Saklama',
      body: 'Kişisel verileriniz uçtan uca şifreleme ve güvenli sunucu altyapısı (HTTPS/TLS) ile korunmaktadır. Verileriniz, yasal zorunluluklar dışında üçüncü taraflarla kesinlikle satılmaz veya pazarlama amacıyla paylaşılmaz.',
    },
    {
      title: '4. Kullanıcı Hakları ve Başvuru',
      body: 'KVKK ve ilgili veri koruma mevzuatı uyarınca verilerinize erişme, düzeltme, silme ve işlenmesine itiraz etme hakkına sahipsiniz. Taleplerinizi destek@appryvo.online adresinden veri sorumlusuna iletebilirsiniz.',
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Kullanım Koşulları',
  updatedLabel: 'Son Güncelleme: 10 Ağustos 2026',
  sourceUrl: 'https://appryvo.online/terms-of-service',
  sections: [
    {
      title: '1. Taraflar ve Kabul',
      body: 'Ryvo platformunu ve mobil uygulamasını indirerek, üye olarak veya kullanarak işbu Kullanım Koşullarını eksiksiz kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız lütfen platformu kullanmayınız.',
    },
    {
      title: '2. Hizmet Kullanım Kuralları',
      body: 'Platformu sadece yasal amaçlar doğrultusunda kullanabilirsiniz. Nefret söylemi, taciz, sahte profil oluşturma ve uygunsuz içerik paylaşımı kesinlikle yasaktır.',
    },
    {
      title: '3. Hesap Güvenliği',
      body: 'Kullanıcılar hesap erişim bilgilerinin güvenliğinden sorumludur. Hesabınız altında gerçekleşen tüm faaliyetlerden tarafınız sorumludur.',
    },
    {
      title: '4. Fesih ve Askıya Alma',
      body: 'Ryvo, kullanım şartlarını ihlal eden kullanıcı hesaplarını önceden bildirimde bulunmaksızın askıya alma veya kalıcı olarak kapatma hakkını saklı tutar.',
    },
  ],
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Crown, Check, ArrowLeft, Heart, Eye, Zap, Compass, ShieldOff, Sparkles } from 'lucide-react';
import { nativeIap } from '../../native/iap';
import { useEntitlementsQuery } from '../../hooks/useQueries';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { toast } from '../../stores/useToastStore';
import { DURATION, EASE } from '../../motion/tokens';

const PLANS = [
  { id: 'weekly', title: 'Haftalık', price: '₺49.99' },
  { id: 'monthly', title: 'Aylık', price: '₺129.99', popular: true },
  { id: 'yearly', title: 'Yıllık', price: '₺899.99' },
] as const;

// Every benefit maps to a real, already-shipped capability gated by /api/entitlements
// or an existing feature (Likes blur, Boost, Passport, ad system) — nothing invented here.
const FEATURES = [
  { icon: Heart, label: 'Sınırsız Beğeni Hakkı' },
  { icon: Eye, label: 'Seni Beğenenleri Anında Gör' },
  { icon: Sparkles, label: 'Haftalık Ücretsiz Superlike' },
  { icon: Zap, label: 'Aylık Ücretsiz Profil Boost' },
  { icon: Compass, label: 'Passport ile Konum Değiştirme' },
  { icon: ShieldOff, label: 'Reklamsız Deneyim' },
];

export const PremiumScreen: React.FC = () => {
  const [selectedPlan, setSelectedPlan] = useState<(typeof PLANS)[number]['id']>('monthly');
  const [isRestoring, setIsRestoring] = useState(false);
  const navigate = useNavigate();
  const { data: entitlements, isLoading, refetch } = useEntitlementsQuery();

  const isPremium = entitlements?.isPremium === true;

  const handlePurchase = () => {
    // There is no in-app-purchase SDK wired into this build (no native billing plugin —
    // adding one is a native-config change out of scope here), so we cannot obtain a real
    // store purchase token. Rather than fabricate one and fake a successful purchase, be
    // honest about the current state instead of calling /api/subscriptions/verify with
    // invented data.
    toast.show('Ödeme altyapısı bu sürümde henüz bağlı değil.', 'neutral');
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await nativeIap.restorePurchases();
      await refetch();
      toast.success('Satın alımların kontrol edildi.');
    } catch (err: any) {
      toast.error(err.message || 'Satın alımlar geri yüklenemedi.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe px-4 flex items-center justify-between my-2">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          <AppLogo size="sm" variant="icon" />
          <h3 className="text-heading text-app">Appryvo VIP</h3>
        </div>
        <div className="w-9" />
      </header>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.emphasis, ease: EASE.decelerate }}
        className="relative flex flex-col items-center text-center px-6 my-8"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-[#F5B942]/15 blur-3xl pointer-events-none" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-[#F5B942] to-[#FBD98A] flex items-center justify-center shadow-premium mb-5">
          <Crown className="w-10 h-10 text-[#3A2A05] fill-current" />
        </div>
        <h1 className="relative text-display text-[#F5B942] mb-2">Sınırsız Ayrıcalıklar</h1>
        <p className="relative text-body text-app-muted max-w-xs leading-relaxed">
          Deneyimini zirveye çıkar, gerçek bağlantılara daha hızlı ulaş.
        </p>
      </motion.div>

      <div className="px-4 pb-6 flex flex-col flex-1">
        {isPremium ? (
          <div className="p-6 rounded-3xl bg-gradient-to-tr from-[#F5B942]/15 to-transparent border border-[#F5B942]/30 text-center space-y-2 shadow-soft">
            <Crown className="w-8 h-8 text-[#F5B942] mx-auto" fill="currentColor" />
            <h4 className="text-body font-extrabold text-app">Zaten VIP Üyesin</h4>
            <p className="text-caption text-app-muted normal-case">Tüm ayrıcalıklar hesabında aktif.</p>
          </div>
        ) : (
          <>
            {/* Plans Selector */}
            <div className="grid grid-cols-3 gap-2 my-2">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative p-3.5 rounded-2xl border flex flex-col items-center text-center transition-all ${
                    selectedPlan === plan.id
                      ? 'border-[#F5B942] bg-[#F5B942]/10 scale-105 shadow-soft'
                      : 'border-app bg-surface'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 bg-[#F5B942] text-[#3A2A05] text-[9px] font-black px-2 py-0.5 rounded-full shadow-soft">
                      POPÜLER
                    </span>
                  )}
                  <span className="text-caption font-extrabold text-app-muted mb-1">{plan.title}</span>
                  <span className="text-body font-black text-app">{plan.price}</span>
                </button>
              ))}
            </div>

            {/* Feature List */}
            <div className="bg-surface border border-app rounded-2xl p-4 my-4 space-y-3 shadow-soft">
              {FEATURES.map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <div key={i} className="flex items-center gap-3 text-caption font-semibold text-app">
                    <div className="w-7 h-7 rounded-full bg-[#F5B942]/15 text-[#F5B942] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span>{feat.label}</span>
                    <Check className="w-3.5 h-3.5 text-[#32D583] ml-auto" />
                  </div>
                );
              })}
            </div>

            {/* Purchase CTA */}
            <AppButton
              onClick={handlePurchase}
              variant="primary"
              size="lg"
              fullWidth
              className="mt-auto bg-gradient-to-r from-[#F5B942] via-[#F0A93E] to-[#F5B942] text-[#3A2A05] shadow-premium"
            >
              {Capacitor.isNativePlatform() ? 'Satın Al ve Başlat' : 'Uygulamada Satın Al'}
            </AppButton>

            <button
              onClick={handleRestore}
              disabled={isRestoring || isLoading}
              className="mt-3 text-caption font-bold text-app-muted underline disabled:opacity-50"
            >
              {isRestoring ? 'Kontrol ediliyor...' : 'Satın Alımları Geri Yükle'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

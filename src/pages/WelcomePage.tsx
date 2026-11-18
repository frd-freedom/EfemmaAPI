import { useEffect, useState } from 'react';
import { ArrowRight, CreditCard, Home, KeyRound, Terminal } from 'lucide-react';
import defaultWelcomeBannerImg from '../assets/images/hero_efemma_infra_1794799003307.jpg';
import { API_ENDPOINTS } from '../data/apiCatalog';
import { PageRoute, SiteContent, UserProfile } from '../types/app';

interface WelcomePageProps {
  content: SiteContent;
  userProfile: UserProfile | null;
  onNavigate: (route: PageRoute) => void;
  onLoginGoogle: () => void;
}

export function WelcomePage({
  content,
  userProfile,
  onNavigate,
  onLoginGoogle,
}: WelcomePageProps) {
  const configuredBannerSrc =
    content.welcomeBannerImageUrl && content.welcomeBannerImageUrl.trim().length > 0
      ? content.welcomeBannerImageUrl.trim()
      : defaultWelcomeBannerImg;

  const [bannerSrc, setBannerSrc] = useState(configuredBannerSrc);

  useEffect(() => {
    setBannerSrc(configuredBannerSrc);
  }, [configuredBannerSrc]);

  const order =
    Array.isArray(content.categoryOrder) && content.categoryOrder.length > 0
      ? content.categoryOrder
      : ['cuaca', 'kurs', 'integrasi', 'spotify'];

  const firstVisibleEndpointId =
    [...API_ENDPOINTS]
      .sort((a, b) => {
        const ia = order.indexOf(a.category);
        const ib = order.indexOf(b.category);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
      .find(
        (ep) =>
          !content.hiddenCategories.includes(ep.category) &&
          !content.hiddenEndpointIds.includes(ep.id)
      )?.id ?? 'cuaca-sekarang';

  const isUnlimited = userProfile?.role === 'admin' || userProfile?.dailyLimit === -1;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-5 sm:py-10 lg:px-8 lg:py-12">
      {/* Minimal Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
      >
        <Home className="h-3.5 w-3.5" />
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-900 dark:text-slate-200">
          {content.welcomePageTitle}
        </span>
      </nav>

      {/* Main Heading & Subtitle */}
      <div className="mt-5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl [text-wrap:balance]">
          {content.welcomePageTitle}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400">
          {content.welcomePageSubtitle}
        </p>
      </div>

      {/* Minimal Uncropped Banner Frame */}
      <figure className="mt-8 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <figcaption className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-2.5 dark:border-white/[0.07]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-950">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3c4.5 0 7 2.5 7 6 0 4-4 5-7 5s-7 1-7 5c0 1.5 1 2.5 3 2.5" />
                <path d="M5 9c0-2 1.5-3.5 4-3.5" />
                <path d="M15 18.5c2.5 0 4-1.5 4-3.5" />
              </svg>
            </span>
            <span className="truncate font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
              {content.brandName}
            </span>
          </div>
          {content.bannerSubtitle && (
            <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {content.bannerSubtitle}
            </span>
          )}
        </figcaption>

        <div className="w-full bg-slate-100/60 dark:bg-[#0D0F14]">
          <img
            src={bannerSrc}
            alt={`Banner ${content.brandName}`}
            referrerPolicy="no-referrer"
            onError={() => {
              if (bannerSrc !== defaultWelcomeBannerImg) {
                setBannerSrc(defaultWelcomeBannerImg);
              }
            }}
            className="mx-auto block h-auto max-h-[440px] w-full object-contain"
          />
        </div>
      </figure>

      {/* Editorial Intro Section */}
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
          {content.introHeading}
        </h2>
        <p className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          {content.introParagraph1}
        </p>
        <p className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          {content.introParagraph2}
        </p>
      </section>

      {/* Minimal Quick Navigation */}
      <div className="mt-10 border-t border-slate-200/70 pt-8 dark:border-white/[0.08]">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'docs', endpointId: firstVisibleEndpointId })}
            className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-transparent p-5 text-left transition-colors duration-150 hover:border-sky-500/45 hover:bg-slate-50/70 dark:border-white/[0.08] dark:hover:border-sky-400/45 dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <div>
              <Terminal className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
              <div className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                {content.welcomeCardDocsTitle}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {content.welcomeCardDocsDesc}
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">
              <span>{content.welcomeCardDocsBtn}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => (userProfile ? onNavigate({ page: 'keys' }) : onLoginGoogle())}
            className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-transparent p-5 text-left transition-colors duration-150 hover:border-emerald-500/45 hover:bg-slate-50/70 dark:border-white/[0.08] dark:hover:border-emerald-400/45 dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <div>
              <KeyRound className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              <div className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                {userProfile ? content.welcomeCardKeysTitle : content.loginButtonLabel}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 tabular-nums">
                {userProfile
                  ? `Sisa kredit: ${
                      isUnlimited
                        ? 'Unlimited'
                        : `${Math.max(0, userProfile.dailyLimit - userProfile.creditsUsedToday)} / ${userProfile.dailyLimit}`
                    }`
                  : content.welcomeCardKeysDesc}
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              <span>{userProfile ? content.welcomeCardKeysBtn : content.loginButtonLabel}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ page: 'pricing' })}
            className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-transparent p-5 text-left transition-colors duration-150 hover:border-amber-500/45 hover:bg-slate-50/70 dark:border-white/[0.08] dark:hover:border-amber-400/45 dark:hover:bg-white/[0.03] cursor-pointer"
          >
            <div>
              <CreditCard className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
              <div className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                {content.welcomeCardPricingTitle}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {content.welcomeCardPricingDesc}
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
              <span>{content.welcomeCardPricingBtn}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

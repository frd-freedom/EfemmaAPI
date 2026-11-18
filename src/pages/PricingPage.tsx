import { Check, Home, MessageCircle } from 'lucide-react';
import { buildWhatsappUrl, PageRoute, SiteContent, UserProfile } from '../types/app';

interface PricingPageProps {
  content: SiteContent;
  userProfile: UserProfile | null;
  onLoginGoogle: () => void;
  onNavigate: (route: PageRoute) => void;
}

export function PricingPage({
  content,
  userProfile,
  onLoginGoogle,
  onNavigate,
}: PricingPageProps) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-5 sm:py-10 lg:px-8 lg:py-12">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
      >
        <button
          type="button"
          onClick={() => onNavigate({ page: 'welcome' })}
          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-900 dark:text-slate-200">
          Paket &amp; Upgrade
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
          {content.pricingTitle}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {content.pricingSubtitle}
        </p>
      </div>

      {/* Dynamic Pricing Plans from Admin Dashboard */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {content.pricingPlans.map((plan) => {
          const waMessage = userProfile
            ? `${plan.whatsappMessage} (Email akun: ${userProfile.email})`
            : plan.whatsappMessage;
          const waHref = buildWhatsappUrl(content.whatsappNumber, waMessage);

          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between rounded-xl border p-5 ${
                plan.highlighted
                  ? 'border-sky-500/50 bg-sky-50/70 dark:border-sky-400/45 dark:bg-sky-500/[0.06]'
                  : 'border-slate-200/80 bg-transparent dark:border-white/[0.08]'
              }`}
            >
              <div>
                <div
                  className={`text-xs font-medium ${
                    plan.highlighted
                      ? 'font-semibold text-sky-600 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {plan.audience}
                </div>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
                  {plan.name}
                </h2>
                <div className="mt-4 flex items-baseline gap-1.5 border-b border-slate-200 pb-4 dark:border-white/10">
                  <span className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {plan.price}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{plan.cadence}</span>
                </div>
                <ul className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  {plan.features.map((feat, idx) => (
                    <li key={`${plan.id}-feat-${idx}`} className="flex items-start gap-2">
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                          plan.highlighted ? 'text-sky-500' : 'text-emerald-500'
                        }`}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan.actionType === 'whatsapp' ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
                      : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400/35 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                  }`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>{plan.buttonLabel}</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => (userProfile ? onNavigate({ page: 'keys' }) : onLoginGoogle())}
                  className="mt-6 w-full rounded-lg border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/20 dark:border-sky-400/35 dark:text-sky-300 dark:hover:bg-sky-500/20 cursor-pointer"
                >
                  {plan.buttonLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dynamic Comparison Table */}
      {content.pricingComparisonRows.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {content.pricingComparisonTitle}
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Fitur / Parameter</th>
                  <th className="px-4 py-3 font-medium">Free</th>
                  <th className="px-4 py-3 font-medium text-sky-600 dark:text-sky-400">Pro</th>
                  <th className="px-4 py-3 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {content.pricingComparisonRows.map((row, idx) => (
                  <tr key={`cmp-row-${idx}`}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {row.feature}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {row.freeValue}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white tabular-nums">
                      {row.proValue}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {row.enterpriseValue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

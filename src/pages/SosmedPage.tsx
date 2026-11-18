import { ArrowUpRight, Home, Share2 } from 'lucide-react';
import { PageRoute, SiteContent } from '../types/app';
import { RichTextLinks } from '../components/RichTextLinks';

interface SosmedPageProps {
  content: SiteContent;
  onNavigate: (route: PageRoute) => void;
}

function getSafeExternalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function SosmedPage({ content, onNavigate }: SosmedPageProps) {
  const items = Array.isArray(content.sosmedItems) ? content.sosmedItems : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10 lg:px-8 lg:py-12">
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
          {content.hubSosmedLabel || 'Sosmed'}
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <Share2 className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
            {content.sosmedPageTitle}
          </h1>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
          <RichTextLinks text={content.sosmedPageSubtitle} />
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.length === 0 ? (
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
            Belum ada tautan sosial media yang dikonfigurasi oleh Admin.
          </div>
        ) : (
          items.map((item, idx) => {
            const safeUrl = getSafeExternalUrl(item.url);
            const isExternal = safeUrl?.startsWith('http');
            return (
              <div
                key={`sosmed-${idx}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-[#111111] dark:hover:border-white/20"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {item.platform}
                    </h2>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                      {item.handle}
                    </span>
                  </div>

                  {item.description && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <RichTextLinks text={item.description} />
                    </p>
                  )}
                </div>

                {safeUrl && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                    <a
                      href={safeUrl}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                      <span>Buka {item.platform}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

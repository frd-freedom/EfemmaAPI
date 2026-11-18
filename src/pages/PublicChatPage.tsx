import { ArrowRight, ArrowUpRight, Clock, Home, MessagesSquare } from 'lucide-react';
import { PageRoute, SiteContent } from '../types/app';
import { RichTextLinks } from '../components/RichTextLinks';

interface PublicChatPageProps {
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

function resolveInternalRoute(raw: string): PageRoute | null {
  const normalized = raw.trim().replace(/^#\/?/, '').replace(/^\/+/, '');
  if (normalized === 'welcome') return { page: 'welcome' };
  if (normalized === 'docs') return { page: 'docs', endpointId: 'cuaca-sekarang' };
  if (normalized.startsWith('docs/')) {
    return { page: 'docs', endpointId: normalized.slice(5).trim() || 'cuaca-sekarang' };
  }
  if (normalized === 'keys') return { page: 'keys' };
  if (normalized === 'pricing') return { page: 'pricing' };
  if (normalized === 'cs') return { page: 'cs' };
  if (normalized === 'faq') return { page: 'faq' };
  if (normalized === 'sosmed') return { page: 'sosmed' };
  return null;
}

export function PublicChatPage({ content, onNavigate }: PublicChatPageProps) {
  const ctaUrl = (content.publicChatCtaUrl || '').trim();
  const isInternal = ctaUrl.startsWith('#') || ctaUrl.startsWith('/');
  const internalTarget = isInternal ? resolveInternalRoute(ctaUrl) : null;
  const externalTarget = !internalTarget && ctaUrl ? getSafeExternalUrl(ctaUrl) : null;

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
          {content.hubPublicChatLabel || 'Public Chat'}
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-3">
          <MessagesSquare className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
            {content.publicChatTitle}
          </h1>
          {content.publicChatBadge && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-medium text-amber-700 dark:text-amber-300">
              <Clock className="h-3 w-3" />
              <span>{content.publicChatBadge}</span>
            </span>
          )}
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
          <RichTextLinks text={content.publicChatSubtitle} />
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200/80 bg-transparent p-6 dark:border-white/[0.08] space-y-5">
        <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <RichTextLinks text={content.publicChatDescription} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
          {content.publicChatCtaLabel && internalTarget && (
            <button
              type="button"
              onClick={() => onNavigate(internalTarget)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              <span>{content.publicChatCtaLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {content.publicChatCtaLabel && externalTarget && (
            <a
              href={externalTarget}
              target={externalTarget.startsWith('http') ? '_blank' : undefined}
              rel={externalTarget.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <span>{content.publicChatCtaLabel}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onNavigate({ page: 'sosmed' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
          >
            <span>Lihat {content.hubSosmedLabel || 'Sosmed'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

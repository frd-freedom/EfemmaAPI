import { FooterLinkItem, PageRoute, SiteContent } from '../types/app';
import { RichTextLinks } from './RichTextLinks';

interface FooterBarProps {
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
  if (!normalized || normalized === 'welcome') return { page: 'welcome' };
  if (normalized === 'docs') return { page: 'docs', endpointId: 'cuaca-sekarang' };
  if (normalized.startsWith('docs/')) {
    const endpointId = normalized.slice(5).trim() || 'cuaca-sekarang';
    return { page: 'docs', endpointId };
  }
  if (normalized === 'keys') return { page: 'keys' };
  if (normalized === 'pricing') return { page: 'pricing' };
  if (normalized === 'admin') return { page: 'admin' };
  if (normalized === 'cs') return { page: 'cs' };
  if (normalized === 'faq') return { page: 'faq' };
  if (normalized === 'sosmed') return { page: 'sosmed' };
  if (normalized === 'public-chat') return { page: 'public-chat' };
  return null;
}

export function FooterBar({ content, onNavigate }: FooterBarProps) {
  const safeGithubUrl = content.footerGithubUrl ? getSafeExternalUrl(content.footerGithubUrl) : null;
  const footerLinks: FooterLinkItem[] = Array.isArray(content.footerLinks)
    ? content.footerLinks
    : [];

  return (
    <footer className="mt-12 border-t border-slate-200/70 px-5 py-9 dark:border-white/[0.08] lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        {/* Centered Brand Emblem */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'welcome' })}
            aria-label={content.footerTitle || content.brandName}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-opacity hover:opacity-75 dark:text-slate-200 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3c4.5 0 7 2.5 7 6 0 4-4 5-7 5s-7 1-7 5c0 1.5 1 2.5 3 2.5" />
              <path d="M5 9c0-2 1.5-3.5 4-3.5" />
              <path d="M15 18.5c2.5 0 4-1.5 4-3.5" />
            </svg>
          </button>
        </div>

        {/* Title + Inline Version Text */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="font-display font-semibold tracking-tight text-slate-900 dark:text-white">
            {content.footerTitle || content.brandName}
          </span>
          {content.footerVersion && (
            <>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                ·
              </span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {content.footerVersion}
              </span>
            </>
          )}
        </div>

        {/* Copyright */}
        {content.footerCopyright && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {content.footerCopyright}
          </p>
        )}

        {/* Multi-line Description with Rich Links */}
        {content.footerBrandDesc && (
          <p className="mx-auto mt-3 max-w-lg whitespace-pre-line text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            <RichTextLinks text={content.footerBrandDesc} />
          </p>
        )}

        {/* Centered Footer Links */}
        {footerLinks.length > 0 && (
          <nav
            aria-label="Navigasi Footer"
            className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400"
          >
            {footerLinks.map((item, idx) => {
              const rawUrl = item.url.trim();
              const isExplicitHashOrSlash = rawUrl.startsWith('#') || rawUrl.startsWith('/');
              const internalRoute = isExplicitHashOrSlash ? resolveInternalRoute(rawUrl) : null;
              if (internalRoute) {
                return (
                  <button
                    key={`${item.label}-${idx}`}
                    type="button"
                    onClick={() => onNavigate(internalRoute)}
                    className="transition-colors hover:text-slate-950 dark:hover:text-white cursor-pointer"
                  >
                    {item.label}
                  </button>
                );
              }

              const safeExternal = getSafeExternalUrl(rawUrl);
              if (!safeExternal) return null;
              const isMailto = safeExternal.startsWith('mailto:');
              return (
                <a
                  key={`${item.label}-${idx}`}
                  href={safeExternal}
                  target={isMailto ? undefined : '_blank'}
                  rel={isMailto ? undefined : 'noopener noreferrer'}
                  className="transition-colors hover:text-slate-950 dark:hover:text-white"
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        )}

        {/* Bottom Action Row: Centered GitHub Icon */}
        {safeGithubUrl && (
          <div className="mt-5 flex justify-center">
            <a
              href={safeGithubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
          </div>
        )}

        {/* Quiet Optional Footer Note */}
        {content.footerRightNote && (
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            <RichTextLinks text={content.footerRightNote} />
          </p>
        )}
      </div>
    </footer>
  );
}

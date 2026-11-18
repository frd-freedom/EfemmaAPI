import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, HelpCircle, Home, Search } from 'lucide-react';
import { PageRoute, SiteContent } from '../types/app';
import { RichTextLinks } from '../components/RichTextLinks';

interface FaqPageProps {
  content: SiteContent;
  onNavigate: (route: PageRoute) => void;
}

export function FaqPage({ content, onNavigate }: FaqPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const items = useMemo(
    () => (Array.isArray(content.faqItems) ? content.faqItems : []),
    [content.faqItems]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

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
          {content.hubFaqLabel || 'FAQ'}
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
            {content.faqPageTitle}
          </h1>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
          <RichTextLinks text={content.faqPageSubtitle} />
        </p>
      </div>

      {/* Filter FAQ */}
      <div className="mt-6 relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setOpenIndex(0);
          }}
          placeholder="Cari pertanyaan atau kata kunci..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#111111] dark:text-white"
        />
      </div>

      {/* Accordion List */}
      <div className="mt-6 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
            {items.length === 0
              ? 'Belum ada daftar FAQ yang ditambahkan oleh Admin.'
              : 'Tidak ada pertanyaan FAQ yang cocok dengan pencarian Anda.'}
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={`faq-${idx}`}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111111]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer"
                >
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-sky-600 dark:text-sky-400' : 'text-slate-400'
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-200 px-5 py-4 text-xs leading-relaxed text-slate-600 dark:border-white/10 dark:text-slate-300 whitespace-pre-line">
                        <RichTextLinks text={item.answer} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Help Link to CS */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-white/10 dark:bg-[#111111]">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          Masih memiliki pertanyaan lain? Hubungi tim dukungan kami langsung.
        </span>
        <button
          type="button"
          onClick={() => onNavigate({ page: 'cs' })}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 cursor-pointer"
        >
          {content.hubCsLabel || 'Kontak CS'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, Search, X } from 'lucide-react';
import { API_ENDPOINTS } from '../data/apiCatalog';
import { PageRoute } from '../types/app';

interface SearchModalProps {
  open: boolean;
  hiddenCategories: string[];
  hiddenEndpointIds: string[];
  privateEndpointIds: string[];
  onClose: () => void;
  onNavigate: (route: PageRoute) => void;
}

export function SearchModal({
  open,
  hiddenCategories,
  hiddenEndpointIds,
  privateEndpointIds,
  onClose,
  onNavigate,
}: SearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = API_ENDPOINTS.filter(
    (ep) =>
      !hiddenCategories.includes(ep.category) &&
      !hiddenEndpointIds.includes(ep.id) &&
      (!q ||
        ep.title.toLowerCase().includes(q) ||
        ep.path.toLowerCase().includes(q) ||
        ep.categoryLabel.toLowerCase().includes(q))
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20 overscroll-none touch-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/15 dark:bg-[#121212] touch-auto"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari endpoint cuaca, kurs, IP, Spotify..."
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup pencarian"
                className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto overscroll-contain p-2 space-y-1">
              {matches.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Endpoint tidak ditemukan.
                </div>
              ) : (
                matches.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => {
                      onNavigate({ page: 'docs', endpointId: ep.id });
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                        {privateEndpointIds.includes(ep.id) && (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                        )}
                        <span className="truncate">{ep.title}</span>
                        {privateEndpointIds.includes(ep.id) && (
                          <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                            Private
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {ep.path}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        ep.method === 'GET'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      [{ep.method}]
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from 'motion/react';
import { LogOut, X } from 'lucide-react';
import { SiteContent } from '../types/app';

interface LogoutConfirmModalProps {
  open: boolean;
  content: SiteContent;
  userEmail?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({
  open,
  content,
  userEmail,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overscroll-none touch-none"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/15 dark:bg-[#121212] touch-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <LogOut className="h-5 w-5 shrink-0" />
                <h2
                  id="logout-confirm-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-white"
                >
                  {content.logoutConfirmTitle}
                </h2>
              </div>

              <button
                type="button"
                onClick={onCancel}
                aria-label="Tutup konfirmasi keluar"
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {content.logoutConfirmMessage}
            </p>

            {userEmail && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300">
                Akun aktif: {userEmail}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
              >
                {content.logoutConfirmCancelLabel}
              </button>

              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 cursor-pointer"
              >
                {content.logoutConfirmYesLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

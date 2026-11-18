import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import { NotificationItem } from '../types/app';
import { RichTextLinks } from './RichTextLinks';

interface ImportantNotifModalProps {
  notification: NotificationItem | null;
  onDismiss: (notifId: string) => void;
}

export function ImportantNotifModal({ notification, onDismiss }: ImportantNotifModalProps) {
  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="penting-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overscroll-none touch-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-xl border border-amber-500/40 bg-white p-6 shadow-2xl dark:bg-[#121212] touch-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wide">
                  Informasi Penting
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(notification.id)}
                aria-label="Tutup pemberitahuan penting"
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h3
              id="penting-modal-title"
              className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-white"
            >
              {notification.title}
            </h3>

            <p className="mt-2 max-h-60 overflow-y-auto overscroll-contain text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
              <RichTextLinks text={notification.message} />
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => onDismiss(notification.id)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

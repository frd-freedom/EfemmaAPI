import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { NotificationItem } from '../types/app';
import { RichTextLinks } from './RichTextLinks';

interface NotificationsModalProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  readNotifIds: Set<string>;
  onMarkRead: (notifId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export function NotificationsModal({
  open,
  onClose,
  notifications,
  readNotifIds,
  onMarkRead,
  onMarkAllRead,
}: NotificationsModalProps) {
  const activeNotifs = notifications.filter((n) => n.active);
  const unreadCount = activeNotifs.filter((n) => !readNotifIds.has(n.id)).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="notif-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overscroll-none touch-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-[#121212] touch-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h2
                  id="notif-modal-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-white"
                >
                  Notifikasi
                </h2>
                {unreadCount > 0 && (
                  <span className="rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white tabular-nums">
                    {unreadCount} baru
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                    <span>Tandai Semua</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup jendela notifikasi"
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">
              {activeNotifs.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-[#0A0A0A]">
                  <Bell className="mx-auto h-7 w-7 text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">
                    Belum ada notifikasi aktif
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Pengumuman terbaru dari pengelola akan ditampilkan di sini.
                  </p>
                </div>
              ) : (
                activeNotifs.map((notif) => {
                  const isRead = readNotifIds.has(notif.id);
                  const priorityLabel =
                    notif.priority === 'always'
                      ? 'Always (Disematkan)'
                      : notif.priority === 'penting'
                      ? 'Penting'
                      : 'Normal';

                  return (
                    <div
                      key={notif.id}
                      className={`rounded-xl border p-4 transition-colors duration-200 ease-out-expo ${
                        isRead
                          ? 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#0D0D0D]'
                          : 'border-sky-500/40 bg-sky-50/50 dark:border-sky-400/40 dark:bg-[#131A26]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`font-mono font-semibold uppercase ${
                                notif.priority === 'penting'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : notif.priority === 'always'
                                  ? 'text-sky-600 dark:text-sky-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {priorityLabel}
                            </span>
                            <span className="h-3 w-px bg-slate-300 dark:bg-white/15" aria-hidden="true" />
                            <span className="text-slate-500 dark:text-slate-400">
                              {isRead ? 'Sudah dibaca' : 'Belum dibaca'}
                            </span>
                          </div>

                          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                            {notif.title}
                          </h3>
                          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                            <RichTextLinks text={notif.message} />
                          </p>
                        </div>

                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(notif.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 shrink-0 cursor-pointer"
                          >
                            Tandai Dibaca
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

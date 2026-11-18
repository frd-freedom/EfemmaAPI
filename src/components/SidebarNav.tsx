import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  ChevronDown,
  CreditCard,
  Home,
  KeyRound,
  Lock,
  Shield,
  X,
} from 'lucide-react';
import { API_ENDPOINTS, ApiCategory } from '../data/apiCatalog';
import { DEFAULT_CATEGORY_ORDER, PageRoute, UserProfile } from '../types/app';

interface SidebarNavProps {
  brandName: string;
  currentRoute: PageRoute;
  categoryOrder: string[];
  hiddenCategories: string[];
  hiddenEndpointIds: string[];
  privateEndpointIds: string[];
  onNavigate: (route: PageRoute) => void;
  onOpenNotifications: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  unreadCount: number;
  userProfile: UserProfile | null;
}

const CATEGORY_GROUPS: Array<{ id: ApiCategory; label: string }> = [
  { id: 'cuaca', label: 'Data Cuaca' },
  { id: 'kurs', label: 'Konversi Mata Uang' },
  { id: 'integrasi', label: 'Integrasi Pihak Ketiga' },
  { id: 'spotify', label: 'Spotify Music & Audio' },
];

export function SidebarNav({
  brandName,
  currentRoute,
  categoryOrder,
  hiddenCategories,
  hiddenEndpointIds,
  privateEndpointIds,
  onNavigate,
  onOpenNotifications,
  mobileOpen,
  onCloseMobile,
  unreadCount,
  userProfile,
}: SidebarNavProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    cuaca: true,
    kurs: true,
    integrasi: true,
    spotify: true,
  });

  const orderedGroups = useMemo(() => {
    const order =
      Array.isArray(categoryOrder) && categoryOrder.length > 0
        ? categoryOrder
        : DEFAULT_CATEGORY_ORDER;
    return [...CATEGORY_GROUPS].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      const rankA = ia === -1 ? 999 : ia;
      const rankB = ib === -1 ? 999 : ib;
      return rankA - rankB;
    });
  }, [categoryOrder]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGo = (route: PageRoute) => {
    onNavigate(route);
    onCloseMobile();
  };

  const handleOpenNotifs = () => {
    onCloseMobile();
    onOpenNotifications();
  };

  const navContent = (
    <div className="flex h-full flex-col bg-white text-slate-700 dark:bg-[#0A0A0A] dark:text-slate-300">
      {/* Mobile Sidebar Header */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200/70 px-4 dark:border-white/[0.08] lg:hidden">
        <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          {brandName}
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup sidebar"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06] cursor-pointer"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Scrollable Navigation Tree */}
      <nav
        aria-label="Menu dokumentasi"
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-5 space-y-5"
      >
        {/* Top Pages Section */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => handleGo({ page: 'welcome' })}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
              currentRoute.page === 'welcome'
                ? 'bg-sky-500/12 text-sky-700 font-semibold dark:bg-sky-500/15 dark:text-sky-300'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200'
            }`}
          >
            <Home className="h-4 w-4 shrink-0" />
            <span>Welcome</span>
          </button>

          <button
            type="button"
            onClick={() => handleGo({ page: 'keys' })}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
              currentRoute.page === 'keys'
                ? 'bg-sky-500/12 text-sky-700 font-semibold dark:bg-sky-500/15 dark:text-sky-300'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="h-4 w-4 shrink-0" />
            <span>Kunci API &amp; Kuota</span>
          </button>

          <button
            type="button"
            onClick={() => handleGo({ page: 'pricing' })}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
              currentRoute.page === 'pricing'
                ? 'bg-sky-500/12 text-sky-700 font-semibold dark:bg-sky-500/15 dark:text-sky-300'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200'
            }`}
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span>Paket &amp; Upgrade</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNotifs}
            className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 shrink-0" />
              <span>Notifikasi</span>
            </span>
            {unreadCount > 0 && (
              <span className="font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {userProfile?.role === 'admin' && (
            <button
              type="button"
              onClick={() => handleGo({ page: 'admin' })}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
                currentRoute.page === 'admin'
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/10'
              }`}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>Dashboard Admin</span>
            </button>
          )}
        </div>

        {/* Hierarchical API Endpoint Tree ordered dynamically */}
        <div className="border-t border-slate-200/70 pt-4 dark:border-white/[0.08] space-y-2.5">
          <div className="px-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Referensi Endpoint
          </div>

          {orderedGroups.map((group) => {
            if (hiddenCategories.includes(group.id)) return null;
            const endpoints = API_ENDPOINTS.filter(
              (ep) => ep.category === group.id && !hiddenEndpointIds.includes(ep.id)
            );
            if (endpoints.length === 0) return null;
            const isOpen = openGroups[group.id] ?? true;
            return (
              <div key={group.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-800 transition-colors duration-150 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ease-out-expo ${
                      isOpen ? 'rotate-0 text-slate-500 dark:text-slate-400' : '-rotate-90 text-slate-400'
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
                      <div className="ml-3.5 border-l border-slate-200/70 pl-2.5 dark:border-white/[0.08] space-y-0.5 py-0.5">
                        {endpoints.map((ep) => {
                          const active =
                            currentRoute.page === 'docs' && currentRoute.endpointId === ep.id;
                          return (
                            <button
                              key={ep.id}
                              type="button"
                              onClick={() => handleGo({ page: 'docs', endpointId: ep.id })}
                              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 cursor-pointer ${
                                active
                                  ? 'bg-sky-500/12 font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.03] dark:hover:text-slate-200'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                {privateEndpointIds.includes(ep.id) && (
                                  <Lock
                                    className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400"
                                    aria-label="Endpoint Private"
                                  />
                                )}
                                <span className="truncate">{ep.title}</span>
                              </span>
                              <span
                                className={`shrink-0 font-mono text-[10px] font-semibold ${
                                  ep.method === 'GET'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {ep.method}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Bottom Credit Status Footer */}
      <div className="border-t border-slate-200/70 px-4 py-3.5 dark:border-white/[0.08] text-xs">
        {userProfile ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Role</span>
              <span className="font-mono font-medium uppercase text-slate-900 dark:text-slate-200">
                {userProfile.role}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Kredit</span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-200 tabular-nums">
                {userProfile.role === 'admin' || userProfile.dailyLimit === -1
                  ? 'Unlimited'
                  : `${userProfile.creditsUsedToday} / ${userProfile.dailyLimit}`}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Masuk Google untuk 10 kredit gratis/hari.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200/70 dark:border-white/[0.08]">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)]">{navContent}</div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden overscroll-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-0 bg-black/65 touch-none"
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-72 max-w-[85vw] h-full border-r border-slate-200/70 dark:border-white/[0.08] shadow-2xl"
            >
              {navContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

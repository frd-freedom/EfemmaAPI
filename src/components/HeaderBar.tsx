import {
  Bell,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { PageRoute, SiteContent, UserProfile } from '../types/app';

interface HeaderBarProps {
  content: SiteContent;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
  userProfile: UserProfile | null;
  authLoading: boolean;
  onLoginGoogle: () => void;
  onRequestLogout: () => void;
  onNavigate: (route: PageRoute) => void;
}

export function HeaderBar({
  content,
  theme,
  onToggleTheme,
  onToggleSidebar,
  onOpenSearch,
  onOpenNotifications,
  unreadCount,
  userProfile,
  authLoading,
  onLoginGoogle,
  onRequestLogout,
  onNavigate,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0A0A0A]/90">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5 lg:px-6">
        {/* Left: Drawer Toggle + Brand Mark */}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Buka atau tutup menu navigasi"
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white lg:hidden cursor-pointer"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ page: 'welcome' })}
            className="flex min-w-0 max-w-full items-center gap-2.5 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-md cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-950 shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3c4.5 0 7 2.5 7 6 0 4-4 5-7 5s-7 1-7 5c0 1.5 1 2.5 3 2.5" />
                <path d="M5 9c0-2 1.5-3.5 4-3.5" />
                <path d="M15 18.5c2.5 0 4-1.5 4-3.5" />
              </svg>
            </span>
            <span className="min-w-0 truncate font-display text-sm sm:text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {content.brandName}
            </span>
          </button>
        </div>

        {/* Right: Minimal Ghost Controls */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Cari endpoint"
            title="Cari endpoint (Ctrl+K)"
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white cursor-pointer"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
            className="relative inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[9px] font-bold text-white tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Auth Controls */}
          {authLoading ? (
            <div className="ml-1 h-8 w-16 sm:h-8 sm:w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-white/10" />
          ) : userProfile ? (
            <div className="ml-0.5 flex items-center gap-0.5 sm:gap-1.5">
              {userProfile.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate({ page: 'admin' })}
                  title="Dashboard Admin"
                  className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 whitespace-nowrap cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Admin</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate({ page: 'keys' })}
                title="Profil & API Key"
                className="inline-flex h-8 w-8 justify-center sm:h-8 sm:w-auto sm:px-2 items-center gap-2 rounded-lg text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                {userProfile.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName}
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <UserIcon className="h-4 w-4 shrink-0" />
                )}
                <span className="hidden md:inline max-w-[110px] truncate">
                  {userProfile.displayName}
                </span>
                <span className="hidden sm:inline font-mono text-[10px] uppercase text-sky-600 dark:text-sky-400">
                  {userProfile.role}
                </span>
              </button>

              <button
                type="button"
                onClick={onRequestLogout}
                title="Keluar"
                aria-label="Keluar dari akun"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-rose-400 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoginGoogle}
              className="ml-1 inline-flex h-8 px-3 items-center gap-1.5 rounded-lg bg-slate-900 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>{content.loginButtonLabel}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

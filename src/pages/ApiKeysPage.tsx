import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Home,
  Info,
  KeyRound,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import { formatExpiryDateTime, getRoleCountdown, toEpochMs } from '../lib/roleExpiry';
import { ADMIN_EMAIL, PageRoute, SiteContent, UsageLogItem, UserProfile } from '../types/app';

interface ApiKeysPageProps {
  content: SiteContent;
  userProfile: UserProfile | null;
  usageLogs: UsageLogItem[];
  onLoginGoogle: () => void;
  onRotateApiKey: () => Promise<void>;
  onNavigate: (route: PageRoute) => void;
}

function TimedRoleCountdownCard({
  role,
  roleExpiresAtMs,
}: {
  role: string;
  roleExpiresAtMs: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [roleExpiresAtMs]);

  const countdown = getRoleCountdown(roleExpiresAtMs, nowMs);

  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        countdown.expired
          ? 'border-rose-500/40 bg-rose-500/10'
          : countdown.months === 0 && countdown.days <= 3
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-sky-500/30 bg-sky-500/[0.06]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Masa Aktif Role {role.toUpperCase()}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
              Berakhir pada: <strong>{formatExpiryDateTime(roleExpiresAtMs)}</strong>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums dark:border-white/10 dark:bg-[#0A0A0A] dark:text-sky-300">
          {countdown.expired ? 'Masa aktif habis — memproses reset...' : `Sisa: ${countdown.summary}`}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
        Saat masa aktif berakhir, role otomatis kembali ke Free (10 kredit/hari) dengan API Key yang tetap sama tanpa diubah, dan akses fitur/endpoint Private premium otomatis dinonaktifkan.
      </p>
    </div>
  );
}

export function ApiKeysPage({
  content,
  userProfile,
  usageLogs,
  onLoginGoogle,
  onRotateApiKey,
  onNavigate,
}: ApiKeysPageProps) {
  const [revealKey, setRevealKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateMessage, setRotateMessage] = useState('');

  const roleExpiresAtMs = toEpochMs(userProfile?.roleExpiresAt);
  const hasTimedRole =
    Boolean(userProfile) &&
    userProfile?.email.toLowerCase() !== ADMIN_EMAIL &&
    userProfile?.role !== 'free' &&
    roleExpiresAtMs > 0;
  const isSuspended =
    Boolean(userProfile?.suspended) &&
    userProfile?.email.toLowerCase() !== ADMIN_EMAIL;

  const handleCopyKey = async () => {
    if (!userProfile) return;
    try {
      await navigator.clipboard.writeText(userProfile.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore
    }
  };

  const handleRotate = async () => {
    if (isSuspended) return;
    setRotating(true);
    setRotateMessage('');
    try {
      await onRotateApiKey();
      setRevealKey(true);
      setRotateMessage(
        'API Key baru berhasil dibuat. Kredit yang sudah terpakai hari ini tetap dipertahankan.'
      );
    } finally {
      setRotating(false);
    }
  };

  if (!userProfile) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10 lg:py-10">
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
          <span aria-hidden="true">&gt;</span>
          <span className="font-medium text-slate-900 dark:text-slate-200">
            {content.keysPageTitle}
          </span>
        </nav>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-[#111111]">
          <KeyRound className="mx-auto h-8 w-8 text-sky-600 dark:text-sky-400" />
          <h1 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-white">
            Masuk untuk Mendapatkan API Key
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
            Setiap pengguna yang masuk melalui Google OAuth memperoleh API Key pribadi serta
            kuota 10 kredit per hari untuk role Free.
          </p>
          <button
            type="button"
            onClick={onLoginGoogle}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>{content.loginButtonLabel}</span>
          </button>
        </div>
      </div>
    );
  }

  const isUnlimited = userProfile.role === 'admin' || userProfile.dailyLimit === -1;
  const remaining = isUnlimited
    ? Infinity
    : Math.max(0, userProfile.dailyLimit - userProfile.creditsUsedToday);
  const progressPct = isUnlimited || userProfile.dailyLimit <= 0
    ? 0
    : Math.min(100, Math.round((userProfile.creditsUsedToday / userProfile.dailyLimit) * 100));

  const maskedKey = `${userProfile.apiKey.slice(0, 12)}****************`;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-5 sm:py-10 lg:px-8 lg:py-12">
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
          {content.keysPageTitle}
        </span>
      </nav>

      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
          {content.keysPageTitle}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {content.keysPageSubtitle}
        </p>
      </div>

      {/* Account & Credit Summary */}
      <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-transparent p-5 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Akun Terhubung</div>
          <div className="mt-1.5 font-medium text-sm text-slate-900 dark:text-white truncate">
            {userProfile.email}
          </div>
          <div className="mt-1 font-mono text-xs uppercase text-slate-600 dark:text-slate-300">
            Role: {userProfile.role}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-transparent p-5 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Kredit Terpakai Hari Ini</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {userProfile.creditsUsedToday}{' '}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              / {isUnlimited ? 'Unlimited' : userProfile.dailyLimit}
            </span>
          </div>
          {!isUnlimited && (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct >= 90 ? 'bg-rose-500' : 'bg-sky-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-transparent p-5 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Sisa Kredit</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {isUnlimited ? 'Unlimited' : remaining}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Periode: {userProfile.creditsResetDate}
          </div>
        </div>
      </div>

      {/* Role Masa Aktif & Isolated Countdown Timer */}
      {hasTimedRole && (
        <TimedRoleCountdownCard role={userProfile.role} roleExpiresAtMs={roleExpiresAtMs} />
      )}

      {isSuspended && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200">
          <AlertOctagon className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div>
            <div className="font-semibold">Status Akun: Disuspend</div>
            <p className="mt-0.5 opacity-90">
              {userProfile.suspendedReason
                ? `Alasan: ${userProfile.suspendedReason}. `
                : ''}
              API Key Anda saat ini diblokir sementara untuk seluruh permintaan endpoint maupun rotasi kunci.
            </p>
          </div>
        </div>
      )}

      {/* API Key Management Card */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-white/10 dark:bg-[#111111] min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              API Key Aktif
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sertakan pada header <code className="font-mono">x-efemma-key</code> saat memanggil
              endpoint dari aplikasi Anda.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRotate}
            disabled={rotating || isSuspended}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />
            <span>{rotating ? 'Membuat...' : content.keysGenerateButtonLabel}</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-[#0A0A0A]">
          <code className="font-mono text-xs sm:text-sm text-slate-900 dark:text-sky-300 break-all">
            {revealKey ? userProfile.apiKey : maskedKey}
          </code>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRevealKey((p) => !p)}
              aria-label={revealKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleCopyKey}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
          <span>
            Pembuatan ulang API Key hanya mengganti kredensial akses. Jumlah kredit yang sudah
            terpakai pada hari berjalan tidak akan di-reset.
          </span>
        </div>

        {rotateMessage && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {rotateMessage}
          </div>
        )}
      </div>

      {/* Recent Usage Logs */}
      <div className="mt-8">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          {content.keysUsageHeading}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
          {usageLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Belum ada aktivitas pemanggilan API yang tercatat pada akun ini.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Metode</th>
                  <th className="px-4 py-3 font-medium">Endpoint</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Latensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {usageLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                      {log.method}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {log.path}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <span
                        className={
                          log.status >= 200 && log.status < 300
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {log.latencyMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import { ChangeEvent, FormEvent, Fragment, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  BarChart3,
  BellPlus,
  Check,
  CheckSquare,
  Clock,
  Compass,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Home,
  ImagePlus,
  Layers,
  Lock,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import defaultWelcomeBannerImg from '../assets/images/hero_efemma_infra_1794799003307.jpg';
import { LatencyMonitorPanel } from '../components/LatencyMonitorPanel';
import { API_ENDPOINTS, ApiCategory, CATEGORY_LABELS } from '../data/apiCatalog';
import {
  addMonthsPreservingDateTime,
  formatExpiryDateTime,
  fromDateTimeLocalInput,
  getDefaultPrivateRoles,
  getPricingRoles,
  getRoleCountdown,
  inferPlanDailyLimit,
  normalizeRoleKey,
  toDateTimeLocalInput,
  toEpochMs,
} from '../lib/roleExpiry';
import {
  ADMIN_EMAIL,
  DEFAULT_CATEGORY_ORDER,
  NotificationItem,
  NotificationPriority,
  PageRoute,
  PricingComparisonRow,
  PricingPlanItem,
  SiteContent,
  UsageLogItem,
  UserProfile,
  UserRole,
} from '../types/app';

interface AdminDashboardPageProps {
  userProfile: UserProfile | null;
  siteContent: SiteContent;
  notifications: NotificationItem[];
  allUsers: UserProfile[];
  historicalLogs: UsageLogItem[];
  onSaveSiteContent: (next: SiteContent) => Promise<void>;
  onCreateNotification: (payload: {
    title: string;
    message: string;
    priority: NotificationPriority;
  }) => Promise<void>;
  onToggleNotificationActive: (id: string, active: boolean) => Promise<void>;
  onDeleteNotification: (id: string) => Promise<void>;
  onUpdateUserRole: (
    uid: string,
    role: UserRole,
    options?: { roleAssignedAt?: number; roleExpiresAt?: number }
  ) => Promise<void>;
  onResetUserCredits: (uid: string) => Promise<void>;
  onBatchUpdateUsersRole: (
    uids: string[],
    role: UserRole,
    options?: { roleAssignedAt?: number; roleExpiresAt?: number; resetCredits?: boolean }
  ) => Promise<void>;
  onBatchResetUserCredits: (
    uids: string[],
    options?: {
      resetUsage?: boolean;
      dailyLimitMode?: 'keep' | 'sync_role' | 'custom';
      customDailyLimit?: number;
    }
  ) => Promise<void>;
  onSuspendUser: (uid: string, suspend: boolean, reason?: string) => Promise<void>;
  onBatchSuspendUsers: (uids: string[], suspend: boolean, reason?: string) => Promise<void>;
  onDeleteUserAccount: (uid: string) => Promise<void>;
  onNavigate: (route: PageRoute) => void;
}

type AdminTab =
  | 'konten'
  | 'visibilitas'
  | 'latensi'
  | 'hub'
  | 'pricing'
  | 'notifikasi'
  | 'pengguna';

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const attempts: Array<{ maxWidth: number; quality: number }> = [
          { maxWidth: 960, quality: 0.82 },
          { maxWidth: 800, quality: 0.72 },
          { maxWidth: 640, quality: 0.62 },
          { maxWidth: 520, quality: 0.5 },
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        let result = '';
        for (const { maxWidth, quality } of attempts) {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          result = canvas.toDataURL('image/jpeg', quality);
          if (result.length <= 320000) {
            resolve(result);
            return;
          }
        }
        if (result.length <= 650000) {
          resolve(result);
        } else {
          reject(new Error('Ukuran gambar terlalu besar setelah dikompresi. Gunakan gambar di bawah 2 MB atau tautan URL.'));
        }
      };
      img.onerror = () => reject(new Error('Berkas gambar tidak dapat dibaca.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });
}

function AdminUserCountdownCell({
  role,
  isSuperAdmin,
  expiresAtMs,
}: {
  role: UserRole;
  isSuperAdmin: boolean;
  expiresAtMs: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const shouldTick = !isSuperAdmin && role !== 'free' && expiresAtMs > 0;

  useEffect(() => {
    if (!shouldTick) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [shouldTick]);

  if (isSuperAdmin) {
    return (
      <span className="text-[11px] text-amber-600 dark:text-amber-400">
        Owner Permanen
      </span>
    );
  }
  if (role === 'free') {
    return <span className="text-[11px] text-slate-400">-</span>;
  }
  if (expiresAtMs <= 0) {
    return (
      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
        Permanen
      </span>
    );
  }

  const countdown = getRoleCountdown(expiresAtMs, nowMs);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${
        countdown.expired
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          : countdown.months === 0 && countdown.days <= 3
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
      }`}
    >
      <Clock className="h-3 w-3 shrink-0" />
      <span>{countdown.summary}</span>
    </span>
  );
}

function AdminLiveClockText() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <strong>{formatExpiryDateTime(nowMs)}</strong>;
}

function AdminDraftCountdownInline({ draftExpiresAt }: { draftExpiresAt: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (draftExpiresAt <= 0) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [draftExpiresAt]);
  return <>({getRoleCountdown(draftExpiresAt, nowMs).summary})</>;
}

export function AdminDashboardPage({
  userProfile,
  siteContent,
  notifications,
  allUsers,
  historicalLogs,
  onSaveSiteContent,
  onCreateNotification,
  onToggleNotificationActive,
  onDeleteNotification,
  onUpdateUserRole,
  onResetUserCredits,
  onBatchUpdateUsersRole,
  onBatchResetUserCredits,
  onSuspendUser,
  onBatchSuspendUsers,
  onDeleteUserAccount,
  onNavigate,
}: AdminDashboardPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('konten');

  const [draftContent, setDraftContent] = useState<SiteContent>(siteContent);
  const [savingContent, setSavingContent] = useState(false);
  const [contentSavedMsg, setContentSavedMsg] = useState('');
  const [contentErrorMsg, setContentErrorMsg] = useState('');
  const [imageErrorMsg, setImageErrorMsg] = useState('');
  const [apiFilterQuery, setApiFilterQuery] = useState('');
  const [apiModeFilter, setApiModeFilter] = useState<'all' | 'public' | 'private' | 'hidden'>('all');
  const [dragCategoryIdx, setDragCategoryIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Tab 4: User Role & Expiration Editor + Batch Processing Tool + Suspend/Delete
  const [editingUserUid, setEditingUserUid] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>('pro');
  const [draftExpiresAt, setDraftExpiresAt] = useState<number>(0);
  const [draftCustomMonths, setDraftCustomMonths] = useState<string>('1');
  const [draftExtendMonths, setDraftExtendMonths] = useState<string>('1');
  const [savingUserUid, setSavingUserUid] = useState<string | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<string>('');
  const [roleErrorFeedback, setRoleErrorFeedback] = useState<string>('');
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [selectedUserUids, setSelectedUserUids] = useState<Set<string>>(() => new Set());
  const [batchActionTab, setBatchActionTab] = useState<'role' | 'credits' | 'status'>('role');
  const [batchTargetRole, setBatchTargetRole] = useState<UserRole>('pro');
  const [batchDurationMode, setBatchDurationMode] = useState<
    '1m' | '3m' | '6m' | '12m' | 'permanent' | 'custom_months' | 'custom_date'
  >('1m');
  const [batchCustomMonths, setBatchCustomMonths] = useState<string>('1');
  const [batchCustomDateLocal, setBatchCustomDateLocal] = useState<string>('');
  const [batchAlsoResetCredits, setBatchAlsoResetCredits] = useState<boolean>(false);
  const [batchCreditResetUsage, setBatchCreditResetUsage] = useState<boolean>(true);
  const [batchCreditLimitMode, setBatchCreditLimitMode] = useState<'keep' | 'sync_role' | 'custom'>(
    'keep'
  );
  const [batchCustomDailyLimit, setBatchCustomDailyLimit] = useState<string>('5000');
  const [batchSuspendReason, setBatchSuspendReason] = useState<string>('');
  const [batchSubmitting, setBatchSubmitting] = useState<boolean>(false);
  const [suspendTargetUser, setSuspendTargetUser] = useState<UserProfile | null>(null);
  const [suspendReasonInput, setSuspendReasonInput] = useState<string>('');
  const [submittingSuspendUid, setSubmittingSuspendUid] = useState<string | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserProfile | null>(null);
  const [deletingUserUid, setDeletingUserUid] = useState<string | null>(null);

  useEffect(() => {
    setDraftContent(siteContent);
  }, [siteContent]);

  const pricingRoles = getPricingRoles(draftContent.pricingPlans);
  const assignableRoles = [
    ...pricingRoles,
    { role: 'admin', label: 'Admin', dailyLimit: -1 },
  ];

  const normalizedCategoryOrder: ApiCategory[] = (() => {
    const base = Array.isArray(draftContent.categoryOrder)
      ? draftContent.categoryOrder
      : DEFAULT_CATEGORY_ORDER;
    const valid: ApiCategory[] = [];
    for (const id of base) {
      if (
        DEFAULT_CATEGORY_ORDER.includes(id) &&
        !valid.includes(id as ApiCategory)
      ) {
        valid.push(id as ApiCategory);
      }
    }
    for (const id of DEFAULT_CATEGORY_ORDER) {
      if (!valid.includes(id as ApiCategory)) {
        valid.push(id as ApiCategory);
      }
    }
    return valid;
  })();

  const moveCategory = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= normalizedCategoryOrder.length ||
      toIdx >= normalizedCategoryOrder.length
    ) {
      return;
    }
    const next = [...normalizedCategoryOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDraftContent((prev) => ({ ...prev, categoryOrder: next }));
  };

  // Tab 3: Notification Creator
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifPriority, setNotifPriority] = useState<NotificationPriority>('normal');
  const [creatingNotif, setCreatingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState('');

  if (!userProfile || userProfile.role !== 'admin') {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 lg:px-10">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <Shield className="mx-auto h-8 w-8 text-rose-500" />
          <h1 className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-white">
            Akses Khusus Administrator
          </h1>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Halaman Dashboard Admin hanya dapat diakses jika Anda masuk menggunakan akun Google{' '}
            <code className="font-mono font-semibold">{ADMIN_EMAIL}</code>.
          </p>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'welcome' })}
            className="mt-5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
          >
            Kembali ke Welcome
          </button>
        </div>
      </div>
    );
  }

  const handleSaveContentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingContent(true);
    setContentSavedMsg('');
    setContentErrorMsg('');
    try {
      await onSaveSiteContent(draftContent);
      setContentSavedMsg('Seluruh perubahan berhasil disimpan ke database.');
    } catch (err) {
      setContentErrorMsg(
        err instanceof Error
          ? `Gagal menyimpan perubahan: ${err.message}`
          : 'Gagal menyimpan perubahan ke database.'
      );
    } finally {
      setSavingContent(false);
    }
  };

  const handleImageFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageErrorMsg('');
    try {
      const compressed = await compressImageToDataUrl(file);
      setDraftContent((prev) => ({ ...prev, welcomeBannerImageUrl: compressed }));
    } catch (err) {
      setImageErrorMsg(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    }
  };

  const handleUpdatePlan = (index: number, patch: Partial<PricingPlanItem>) => {
    setDraftContent((prev) => {
      const next = [...prev.pricingPlans];
      next[index] = { ...next[index], ...patch };
      return { ...prev, pricingPlans: next };
    });
  };

  const handleAddPlan = () => {
    setDraftContent((prev) => {
      if (prev.pricingPlans.length >= 10) return prev;
      const existingIds = new Set(prev.pricingPlans.map((p) => normalizeRoleKey(p.id || p.name || '')));
      let seq = prev.pricingPlans.length + 1;
      let nextId = `paket_${seq}`;
      while (existingIds.has(nextId)) {
        seq += 1;
        nextId = `paket_${seq}`;
      }
      return {
        ...prev,
        pricingPlans: [
          ...prev.pricingPlans,
          {
            id: nextId,
            audience: 'Paket Baru',
            name: `Paket ${seq}`,
            price: 'Rp 199.000',
            cadence: '/ bulan',
            dailyLimit: 10000,
            features: ['10.000 kredit per hari', 'Akses endpoint prioritas'],
            buttonLabel: 'Beli via WhatsApp',
            actionType: 'whatsapp',
            whatsappMessage: `Halo Admin EfemmaAPI, saya ingin memesan paket Role Paket ${seq}.`,
            highlighted: false,
          },
        ],
      };
    });
  };

  const handleDeletePlan = (index: number) => {
    setDraftContent((prev) => {
      if (prev.pricingPlans.length <= 1) return prev;
      return {
        ...prev,
        pricingPlans: prev.pricingPlans.filter((_, i) => i !== index),
      };
    });
  };

  const handleUpdateComparisonRow = (index: number, patch: Partial<PricingComparisonRow>) => {
    setDraftContent((prev) => {
      const next = [...prev.pricingComparisonRows];
      next[index] = { ...next[index], ...patch };
      return { ...prev, pricingComparisonRows: next };
    });
  };

  const handleAddComparisonRow = () => {
    setDraftContent((prev) => {
      if (prev.pricingComparisonRows.length >= 20) return prev;
      return {
        ...prev,
        pricingComparisonRows: [
          ...prev.pricingComparisonRows,
          {
            feature: 'Fitur Baru',
            freeValue: 'Terbatas',
            proValue: 'Penuh',
            enterpriseValue: 'Kustom',
          },
        ],
      };
    });
  };

  const handleDeleteComparisonRow = (index: number) => {
    setDraftContent((prev) => ({
      ...prev,
      pricingComparisonRows: prev.pricingComparisonRows.filter((_, i) => i !== index),
    }));
  };

  const handleCreateNotifSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    setCreatingNotif(true);
    setNotifFeedback('');
    try {
      await onCreateNotification({
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        priority: notifPriority,
      });
      setNotifTitle('');
      setNotifMessage('');
      setNotifPriority('normal');
      setNotifFeedback('Notifikasi baru berhasil diterbitkan ke seluruh pengguna.');
    } finally {
      setCreatingNotif(false);
    }
  };

  const previewBannerSrc =
    draftContent.welcomeBannerImageUrl && draftContent.welcomeBannerImageUrl.trim().length > 0
      ? draftContent.welcomeBannerImageUrl.trim()
      : defaultWelcomeBannerImg;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-3.5 py-6 sm:px-5 sm:py-8 lg:px-10 lg:py-10">
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
        <span className="font-medium text-slate-900 dark:text-slate-200">Dashboard Admin</span>
      </nav>

      <div className="mt-5 border-b border-slate-200 pb-6 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Dashboard Administrator
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Kelola seluruh teks halaman, gambar Welcome, label tombol, daftar pricing WhatsApp,
              notifikasi, dan akun pengguna.
            </p>
          </div>
          <div className="max-w-full break-all rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-700 dark:text-amber-300">
            Admin: {userProfile.email}
          </div>
        </div>

        {/* Admin Tabs */}
        <div className="mt-6 flex w-full max-w-full flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-fit dark:border-white/10 dark:bg-[#111111]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('konten');
              setContentSavedMsg('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'konten'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <PencilLine className="h-3.5 w-3.5" />
            <span>Teks, Gambar &amp; Tombol</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('visibilitas');
              setContentSavedMsg('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'visibilitas'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>
              Visibilitas &amp; Privat API (
              {draftContent.privateEndpointIds.length} Privat)
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('latensi');
              setContentSavedMsg('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'latensi'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Monitor Latensi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('hub');
              setContentSavedMsg('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'hub'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Menu Melingkar &amp; Hub</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('pricing');
              setContentSavedMsg('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'pricing'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Pricing &amp; WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifikasi')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'notifikasi'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BellPlus className="h-3.5 w-3.5" />
            <span>Notifikasi ({notifications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pengguna')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
              activeTab === 'pengguna'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Pengguna ({allUsers.length})</span>
          </button>
        </div>
      </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          className="min-w-0 max-w-full"
        >
      {/* TAB 1: ALL PAGES TEXT, IMAGE & BUTTONS EDITOR */}
      {activeTab === 'konten' && (
        <form onSubmit={handleSaveContentSubmit} className="mt-6 space-y-8">
          {/* Group A: Header & Logout Modal */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Header &amp; Modal Konfirmasi Keluar
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nama Brand Header
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.brandName}
                  onChange={(e) => setDraftContent((p) => ({ ...p, brandName: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label Tombol Masuk (Header)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.loginButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, loginButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Konfirmasi Keluar
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.logoutConfirmTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, logoutConfirmTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tombol Batal
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    required
                    value={draftContent.logoutConfirmCancelLabel}
                    onChange={(e) =>
                      setDraftContent((p) => ({ ...p, logoutConfirmCancelLabel: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tombol Ya Keluar
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    required
                    value={draftContent.logoutConfirmYesLabel}
                    onChange={(e) =>
                      setDraftContent((p) => ({ ...p, logoutConfirmYesLabel: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Pesan Konfirmasi Keluar
              </label>
              <input
                type="text"
                maxLength={240}
                required
                value={draftContent.logoutConfirmMessage}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, logoutConfirmMessage: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>
          </div>

          {/* Group B: Welcome Page & Editable Image */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman Welcome, Gambar Banner &amp; Tombol Kartu
            </h2>

            {/* Banner Image Editor */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#0A0A0A] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Gambar Banner Welcome
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer">
                    <ImagePlus className="h-3.5 w-3.5 text-sky-500" />
                    <span>Unggah Gambar</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileUpload}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftContent((p) => ({ ...p, welcomeBannerImageUrl: '' }))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Bawaan</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-center">
                <div className="sm:col-span-4 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 h-28 bg-slate-900">
                  <img
                    src={previewBannerSrc}
                    alt="Pratinjau gambar banner Welcome"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="sm:col-span-8 space-y-2">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Atau tempel tautan URL gambar langsung (kosongkan untuk gambar bawaan)
                  </label>
                  <input
                    type="text"
                    value={draftContent.welcomeBannerImageUrl}
                    onChange={(e) =>
                      setDraftContent((p) => ({ ...p, welcomeBannerImageUrl: e.target.value }))
                    }
                    placeholder="https://example.com/banner.jpg"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                  {imageErrorMsg && <p className="text-xs text-rose-500">{imageErrorMsg}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman Welcome
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.welcomePageTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomePageTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subjudul Welcome
                </label>
                <input
                  type="text"
                  maxLength={240}
                  required
                  value={draftContent.welcomePageSubtitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomePageSubtitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subjudul Kartu Banner
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.bannerSubtitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, bannerSubtitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Judul Pengantar
              </label>
              <input
                type="text"
                maxLength={160}
                required
                value={draftContent.introHeading}
                onChange={(e) => setDraftContent((p) => ({ ...p, introHeading: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paragraf Pengantar 1
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  required
                  value={draftContent.introParagraph1}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, introParagraph1: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paragraf Pengantar 2
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  required
                  value={draftContent.introParagraph2}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, introParagraph2: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            {/* 3 Quick Cards on Welcome */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Kartu 1 (Dokumentasi)
                </div>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.welcomeCardDocsTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardDocsTitle: e.target.value }))
                  }
                  placeholder="Judul"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <textarea
                  rows={2}
                  maxLength={240}
                  required
                  value={draftContent.welcomeCardDocsDesc}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardDocsDesc: e.target.value }))
                  }
                  placeholder="Deskripsi"
                  className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <input
                  type="text"
                  maxLength={50}
                  required
                  value={draftContent.welcomeCardDocsBtn}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardDocsBtn: e.target.value }))
                  }
                  placeholder="Teks Tombol"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Kartu 2 (API Key)
                </div>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.welcomeCardKeysTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardKeysTitle: e.target.value }))
                  }
                  placeholder="Judul"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <textarea
                  rows={2}
                  maxLength={240}
                  required
                  value={draftContent.welcomeCardKeysDesc}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardKeysDesc: e.target.value }))
                  }
                  placeholder="Deskripsi"
                  className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <input
                  type="text"
                  maxLength={50}
                  required
                  value={draftContent.welcomeCardKeysBtn}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardKeysBtn: e.target.value }))
                  }
                  placeholder="Teks Tombol"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Kartu 3 (Pricing)
                </div>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.welcomeCardPricingTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardPricingTitle: e.target.value }))
                  }
                  placeholder="Judul"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <textarea
                  rows={2}
                  maxLength={240}
                  required
                  value={draftContent.welcomeCardPricingDesc}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardPricingDesc: e.target.value }))
                  }
                  placeholder="Deskripsi"
                  className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
                <input
                  type="text"
                  maxLength={50}
                  required
                  value={draftContent.welcomeCardPricingBtn}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, welcomeCardPricingBtn: e.target.value }))
                  }
                  placeholder="Teks Tombol"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Group C: Docs & API Keys Pages */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman Dokumentasi &amp; Kunci API
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Pesan Informasi di Halaman Dokumentasi
              </label>
              <input
                type="text"
                maxLength={400}
                required
                value={draftContent.docsNotice}
                onChange={(e) => setDraftContent((p) => ({ ...p, docsNotice: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tombol Kirim Request
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.docsRunButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, docsRunButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tombol Masuk di Docs
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.docsLoginButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, docsLoginButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tombol Upgrade di Docs
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.docsUpgradeButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, docsUpgradeButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tombol Lihat API Key
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.docsViewKeyButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, docsViewKeyButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman Kunci API
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.keysPageTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, keysPageTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subjudul Halaman Kunci API
                </label>
                <input
                  type="text"
                  maxLength={240}
                  required
                  value={draftContent.keysPageSubtitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, keysPageSubtitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tombol Generate Key Baru
                </label>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={draftContent.keysGenerateButtonLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, keysGenerateButtonLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Tabel Riwayat Permintaan
                </label>
                <input
                  type="text"
                  maxLength={100}
                  required
                  value={draftContent.keysUsageHeading}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, keysUsageHeading: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Group C2: Spotify Player Panel Texts */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Panel Player Spotify (Audio Full Song)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Panel Spotify Player
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.spotifyPlayerTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, spotifyPlayerTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label Badge Spotify
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.spotifyPlayerBadge}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, spotifyPlayerBadge: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Deskripsi Panel Spotify Player
              </label>
              <textarea
                rows={2}
                maxLength={500}
                required
                value={draftContent.spotifyPlayerDesc}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, spotifyPlayerDesc: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>
          </div>

          {/* Group D: Footer Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Footer Website
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Footer
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={draftContent.footerTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, footerTitle: e.target.value }))
                  }
                  placeholder="EfemmaAPI Docs"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tag Versi Footer
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={draftContent.footerVersion}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, footerVersion: e.target.value }))
                  }
                  placeholder="v2.0.2 (kosongkan untuk sembunyikan)"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Teks Hak Cipta
                </label>
                <input
                  type="text"
                  maxLength={160}
                  required
                  value={draftContent.footerCopyright}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, footerCopyright: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  URL Ikon GitHub Footer
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={draftContent.footerGithubUrl}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, footerGithubUrl: e.target.value }))
                  }
                  placeholder="https://github.com/username (kosongkan untuk sembunyikan)"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Deskripsi Footer (Opsional, Multi-baris &amp; Mendukung Tautan)
              </label>
              <textarea
                rows={4}
                maxLength={500}
                value={draftContent.footerBrandDesc}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, footerBrandDesc: e.target.value }))
                }
                placeholder="Tekan Enter untuk baris ke bawah. Kirim link dengan https://... atau [teks](https://...)"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Tekan Enter untuk menambah baris ke bawah. Tulis tautan langsung <code className="font-mono">https://...</code> atau dibungkus <code className="font-mono">[teks](https://...)</code> agar dapat diklik.
              </p>
            </div>

            {/* Dynamic Footer Links Editor */}
            <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tautan Navigasi Footer
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Gunakan <code className="font-mono">#welcome</code>, <code className="font-mono">#docs</code>, <code className="font-mono">#keys</code>, <code className="font-mono">#pricing</code> atau URL <code className="font-mono">https://...</code>.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={draftContent.footerLinks.length >= 10}
                  onClick={() =>
                    setDraftContent((p) => ({
                      ...p,
                      footerLinks: [
                        ...p.footerLinks,
                        { label: 'Tautan Baru', url: 'https://' },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Tautan</span>
                </button>
              </div>

              {draftContent.footerLinks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Belum ada tautan footer. Klik &quot;Tambah Tautan&quot; untuk menambahkan.
                </p>
              ) : (
                <div className="space-y-2">
                  {draftContent.footerLinks.map((linkItem, index) => (
                    <div
                      key={`footer-link-${index}`}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 sm:flex-row sm:items-center dark:border-white/10 dark:bg-[#0A0A0A]"
                    >
                      <input
                        type="text"
                        maxLength={50}
                        value={linkItem.label}
                        onChange={(e) =>
                          setDraftContent((p) => {
                            const next = [...p.footerLinks];
                            next[index] = { ...next[index], label: e.target.value };
                            return { ...p, footerLinks: next };
                          })
                        }
                        placeholder="Label tautan (mis. Dokumentasi)"
                        className="w-full sm:w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-[#111111] dark:text-white"
                      />
                      <input
                        type="text"
                        maxLength={300}
                        value={linkItem.url}
                        onChange={(e) =>
                          setDraftContent((p) => {
                            const next = [...p.footerLinks];
                            next[index] = { ...next[index], url: e.target.value };
                            return { ...p, footerLinks: next };
                          })
                        }
                        placeholder="#docs atau https://..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#111111] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraftContent((p) => ({
                            ...p,
                            footerLinks: p.footerLinks.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={`Hapus tautan ${linkItem.label || index + 1}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-500 hover:bg-rose-50 dark:border-white/10 dark:bg-[#111111] dark:hover:bg-rose-500/10 cursor-pointer self-end sm:self-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Catatan Bawah Footer (Opsional)
              </label>
              <input
                type="text"
                maxLength={160}
                value={draftContent.footerRightNote}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, footerRightNote: e.target.value }))
                }
                placeholder="Autentikasi Header x-efemma-key. (kosongkan untuk sembunyikan)"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {contentErrorMsg ? (
              <span className="text-xs text-rose-500">{contentErrorMsg}</span>
            ) : contentSavedMsg ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>{contentSavedMsg}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Perubahan langsung diterapkan ke seluruh halaman website.
              </span>
            )}

            <button
              type="submit"
              disabled={savingContent}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              {savingContent ? 'Menyimpan...' : 'Simpan Semua Teks & Gambar'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 1.5: API CATEGORY ORDER (DRAG & DROP) & VISIBILITY */}
      {activeTab === 'visibilitas' && (
        <form onSubmit={handleSaveContentSubmit} className="mt-6 space-y-6 min-w-0 max-w-full">
          {/* Drag & Drop Category Reordering */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 dark:border-white/10 dark:bg-[#111111] space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Urutan Kategori API di Bilah Navigasi (Seret / Drag &amp; Drop)
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Seret kategori ke atas atau ke bawah (misalnya seret Spotify ke urutan #1 paling atas atau #2) untuk mengatur posisi tampilnya di bilah navigasi.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftContent((p) => ({
                    ...p,
                    categoryOrder: [...DEFAULT_CATEGORY_ORDER],
                  }))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Urutan</span>
              </button>
            </div>

            <div className="space-y-2">
              {normalizedCategoryOrder.map((cat, idx) => {
                const isCatHidden = draftContent.hiddenCategories.includes(cat);
                const isDragging = dragCategoryIdx === idx;
                const isDragOver = dragOverIdx === idx && dragCategoryIdx !== idx;
                return (
                  <div
                    key={cat}
                    draggable
                    onDragStart={(e) => {
                      setDragCategoryIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragCategoryIdx ?? Number(e.dataTransfer.getData('text/plain'));
                      if (Number.isInteger(from)) {
                        moveCategory(from, idx);
                      }
                      setDragCategoryIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragCategoryIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition-all duration-150 ease-out-expo select-none cursor-grab active:cursor-grabbing ${
                      isDragOver
                        ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40'
                        : isDragging
                        ? 'border-slate-300 bg-slate-100 opacity-60 dark:border-white/20 dark:bg-white/10'
                        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-white/10 dark:bg-[#0A0A0A] dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200 tabular-nums">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      {isCatHidden && (
                        <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-600 dark:text-rose-300">
                          Tersembunyi
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveCategory(idx, idx - 1)}
                        aria-label={`Geser ${CATEGORY_LABELS[cat]} ke atas`}
                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-35 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === normalizedCategoryOrder.length - 1}
                        onClick={() => moveCategory(idx, idx + 1)}
                        aria-label={`Geser ${CATEGORY_LABELS[cat]} ke bawah`}
                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-35 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 dark:border-white/10 dark:bg-[#111111] space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Sembunyikan Kategori Layanan API
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Kategori yang disembunyikan tidak akan tampil di navigasi samping, pencarian cepat, maupun halaman dokumentasi publik.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftContent((p) => ({
                    ...p,
                    hiddenCategories: [],
                    hiddenEndpointIds: [],
                  }))
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
              >
                Tampilkan Semua API
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {normalizedCategoryOrder.map((cat) => {
                const isCatHidden = draftContent.hiddenCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      setDraftContent((p) => ({
                        ...p,
                        hiddenCategories: isCatHidden
                          ? p.hiddenCategories.filter((c) => c !== cat)
                          : [...p.hiddenCategories, cat],
                      }))
                    }
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 text-left text-xs transition-colors cursor-pointer ${
                      isCatHidden
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : 'border-emerald-500/30 bg-emerald-500/[0.06] text-slate-900 dark:text-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{CATEGORY_LABELS[cat]}</div>
                      <div className="text-[11px] opacity-80">
                        {isCatHidden ? 'Disembunyikan' : 'Ditampilkan'}
                      </div>
                    </div>
                    {isCatHidden ? (
                      <EyeOff className="h-4 w-4 shrink-0 text-rose-500" />
                    ) : (
                      <Eye className="h-4 w-4 shrink-0 text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 dark:border-white/10 dark:bg-[#111111] space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Mode Publik / Privat &amp; Visibilitas Endpoint ({API_ENDPOINTS.length} Endpoint)
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ubah mode tiap endpoint antara <strong>Publik</strong> dan <strong>Privat</strong>, lalu pilih peran yang diizinkan mengakses endpoint Privat tersebut. Pengguna Free tetap dapat melihat halaman dokumentasi Privat, tetapi tidak dapat mengeksekusinya.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingContent}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  {savingContent ? 'Menyimpan...' : 'Simpan Pengaturan API'}
                </button>
              </div>
            </div>

            {(contentErrorMsg || contentSavedMsg) && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  contentErrorMsg
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {contentErrorMsg || contentSavedMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { id: 'all', label: `Semua (${API_ENDPOINTS.length})` },
                  {
                    id: 'public',
                    label: `Publik (${API_ENDPOINTS.length - draftContent.privateEndpointIds.length})`,
                  },
                  {
                    id: 'private',
                    label: `Privat (${draftContent.privateEndpointIds.length})`,
                  },
                  {
                    id: 'hidden',
                    label: `Tersembunyi (${draftContent.hiddenEndpointIds.length})`,
                  },
                ] as const).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setApiModeFilter(f.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      apiModeFilter === f.id
                        ? 'border-sky-500 bg-sky-500/10 font-semibold text-sky-700 dark:text-sky-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={apiFilterQuery}
                onChange={(e) => setApiFilterQuery(e.target.value)}
                placeholder="Filter nama atau jalur endpoint..."
                className="w-full sm:w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10 min-w-0 overflow-hidden">
              {API_ENDPOINTS.filter((ep) => {
                const isPriv = draftContent.privateEndpointIds.includes(ep.id);
                const isHid = draftContent.hiddenEndpointIds.includes(ep.id);
                if (apiModeFilter === 'public' && isPriv) return false;
                if (apiModeFilter === 'private' && !isPriv) return false;
                if (apiModeFilter === 'hidden' && !isHid) return false;
                const q = apiFilterQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  ep.title.toLowerCase().includes(q) ||
                  ep.path.toLowerCase().includes(q) ||
                  ep.categoryLabel.toLowerCase().includes(q)
                );
              }).map((ep) => {
                const catHidden = draftContent.hiddenCategories.includes(ep.category);
                const epHidden = draftContent.hiddenEndpointIds.includes(ep.id);
                const effectivelyHidden = catHidden || epHidden;
                const isPrivate = draftContent.privateEndpointIds.includes(ep.id);
                const defaultPrivateRoles = getDefaultPrivateRoles(draftContent.pricingPlans);
                const hasExplicitRoles =
                  Object.prototype.hasOwnProperty.call(draftContent.privateEndpointRoles, ep.id) &&
                  Array.isArray(draftContent.privateEndpointRoles[ep.id]);
                const allowedRoles: UserRole[] = hasExplicitRoles
                  ? Array.from(
                      new Set(
                        draftContent.privateEndpointRoles[ep.id]
                          .map((r) => normalizeRoleKey(String(r)))
                          .filter((r) => r.length > 0 && r !== 'admin')
                      )
                    )
                  : defaultPrivateRoles;

                const setEndpointMode = (mode: 'public' | 'private') => {
                  setDraftContent((p) => {
                    const nextIds =
                      mode === 'private'
                        ? p.privateEndpointIds.includes(ep.id)
                          ? p.privateEndpointIds
                          : [...p.privateEndpointIds, ep.id]
                        : p.privateEndpointIds.filter((id) => id !== ep.id);
                    const nextRoles = { ...p.privateEndpointRoles };
                    if (
                      mode === 'private' &&
                      !Object.prototype.hasOwnProperty.call(nextRoles, ep.id)
                    ) {
                      nextRoles[ep.id] = getDefaultPrivateRoles(p.pricingPlans);
                    }
                    return {
                      ...p,
                      privateEndpointIds: nextIds,
                      privateEndpointRoles: nextRoles,
                    };
                  });
                };

                const toggleRolePermission = (targetRole: string) => {
                  const normalizedTarget = normalizeRoleKey(targetRole);
                  if (!normalizedTarget || normalizedTarget === 'admin') return;
                  setDraftContent((p) => {
                    const hasExplicit =
                      Object.prototype.hasOwnProperty.call(p.privateEndpointRoles, ep.id) &&
                      Array.isArray(p.privateEndpointRoles[ep.id]);
                    const current = hasExplicit
                      ? p.privateEndpointRoles[ep.id]
                          .map((r) => normalizeRoleKey(String(r)))
                          .filter((r) => r.length > 0 && r !== 'admin')
                      : getDefaultPrivateRoles(p.pricingPlans);
                    const has = current.includes(normalizedTarget);
                    const next = has
                      ? current.filter((r) => r !== normalizedTarget)
                      : [...current, normalizedTarget];
                    return {
                      ...p,
                      privateEndpointRoles: {
                        ...p.privateEndpointRoles,
                        [ep.id]: next,
                      },
                    };
                  });
                };

                const privateRoleSummary =
                  allowedRoles.length > 0
                    ? `ADMIN, ${allowedRoles.map((r) => r.toUpperCase()).join(', ')}`
                    : 'Hanya ADMIN';

                return (
                  <div
                    key={ep.id}
                    className="flex flex-col gap-2.5 px-3.5 py-3.5 sm:px-4 text-xs min-w-0"
                  >
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white break-words">
                            {ep.title}
                          </span>
                          <span className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:text-slate-300">
                            {ep.categoryLabel}
                          </span>
                          {isPrivate ? (
                            <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300 break-words">
                              <Lock className="h-2.5 w-2.5 shrink-0" />
                              <span>Privat ({privateRoleSummary})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                              <Globe className="h-2.5 w-2.5 shrink-0" />
                              <span>Publik</span>
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                          [{ep.method}] {ep.path}
                        </div>
                      </div>

                      <div className="flex w-full sm:w-auto flex-wrap items-center gap-2 min-w-0">
                        {catHidden && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            Kategori disembunyikan
                          </span>
                        )}

                        {/* Segmented Publik / Privat Mode Selector */}
                        <div
                          role="group"
                          aria-label={`Mode akses ${ep.title}`}
                          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-[#0A0A0A]"
                        >
                          <button
                            type="button"
                            onClick={() => setEndpointMode('public')}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                              !isPrivate
                                ? 'bg-sky-500 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                          >
                            <Globe className="h-3 w-3" />
                            <span>Publik</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEndpointMode('private')}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                              isPrivate
                                ? 'bg-amber-500 text-white shadow-xs dark:bg-amber-500 dark:text-slate-950'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                          >
                            <Lock className="h-3 w-3" />
                            <span>Privat</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDraftContent((p) => ({
                              ...p,
                              hiddenEndpointIds: epHidden
                                ? p.hiddenEndpointIds.filter((id) => id !== ep.id)
                                : [...p.hiddenEndpointIds, ep.id],
                            }))
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                            effectivelyHidden
                              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {epHidden ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              <span>Tersembunyi</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              <span>Ditampilkan</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {isPrivate && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 min-w-0 max-w-full">
                        <span className="w-full text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          Role Pricing yang diizinkan / tidak diizinkan mengakses endpoint Privat ini:
                        </span>

                        <span
                          title="Admin selalu memiliki akses penuh ke seluruh endpoint Private"
                          className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                          <Shield className="h-2.5 w-2.5" />
                          <span>ADMIN (Selalu Akses)</span>
                        </span>

                        {pricingRoles.map((planRole) => {
                          const checked = allowedRoles.includes(planRole.role);
                          return (
                            <button
                              key={planRole.role}
                              type="button"
                              onClick={() => toggleRolePermission(planRole.role)}
                              aria-pressed={checked}
                              title={
                                checked
                                  ? `Role ${planRole.label} DIIZINKAN mengakses endpoint ini (klik untuk cabut)`
                                  : `Role ${planRole.label} TIDAK DIIZINKAN — hanya melihat dokumentasi (klik untuk izinkan)`
                              }
                              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 font-mono text-[11px] transition-colors cursor-pointer ${
                                checked
                                  ? 'border-amber-500 bg-amber-500/20 font-semibold text-amber-800 dark:text-amber-200'
                                  : 'border-slate-200 bg-white text-slate-500 hover:border-amber-400 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-400'
                              }`}
                            >
                              <span
                                className={`inline-flex h-3 w-3 items-center justify-center rounded-xs border ${
                                  checked
                                    ? 'border-amber-600 bg-amber-500 text-white dark:border-amber-400 dark:text-slate-950'
                                    : 'border-slate-300 dark:border-white/25'
                                }`}
                              >
                                {checked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </span>
                              <span className="uppercase">{planRole.role}</span>
                              <span className="text-[10px] opacity-80">
                                ({checked ? 'Diizinkan' : 'Tidak'})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {contentErrorMsg ? (
              <span className="text-xs text-rose-500">{contentErrorMsg}</span>
            ) : contentSavedMsg ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>{contentSavedMsg}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Simpan perubahan agar pengaturan hide/show list API langsung berlaku untuk seluruh pengguna.
              </span>
            )}

            <button
              type="submit"
              disabled={savingContent}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              {savingContent ? 'Menyimpan...' : 'Simpan Visibilitas API'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 1.6: REAL-TIME LATENCY MONITOR BAR CHART */}
      {activeTab === 'latensi' && (
        <LatencyMonitorPanel historicalLogs={historicalLogs} onNavigate={onNavigate} />
      )}

      {/* TAB 2: PRICING & WHATSAPP EDITOR */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSaveContentSubmit} className="mt-6 space-y-8">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Pengaturan Umum Halaman Pricing &amp; WhatsApp
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman Pricing
                </label>
                <input
                  type="text"
                  maxLength={140}
                  required
                  value={draftContent.pricingTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, pricingTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nomor WhatsApp Tujuan (Format Internasional, misal 6281234567890)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  required
                  value={draftContent.whatsappNumber}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, whatsappNumber: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Subjudul Halaman Pricing
              </label>
              <input
                type="text"
                maxLength={300}
                required
                value={draftContent.pricingSubtitle}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, pricingSubtitle: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>
          </div>

          {/* Pricing Plans List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Daftar Paket Pricing ({draftContent.pricingPlans.length})
              </h2>
              <button
                type="button"
                onClick={handleAddPlan}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Paket</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Setiap paket di bawah otomatis terdaftar sebagai <strong>Role</strong> pada daftar izin endpoint Privat (Tab Visibilitas API) dan pilihan role Pengguna. Jangan lupa klik <strong>Simpan Pengaturan</strong> setelah menambah atau mengubah paket.
            </p>

            {draftContent.pricingPlans.map((plan, idx) => {
              const resolvedDailyLimit = inferPlanDailyLimit(plan);
              const normalizedPlanRole = normalizeRoleKey(plan.id || plan.name || '');
              return (
              <div
                key={`pricing-plan-${idx}`}
                className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Paket #{idx + 1}: {plan.name}
                    </span>
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                      Role: {normalizedPlanRole}
                    </span>
                  </div>
                  {draftContent.pricingPlans.length > 1 && normalizedPlanRole !== 'free' && (
                    <button
                      type="button"
                      onClick={() => handleDeletePlan(idx)}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <label className="block text-[11px] text-slate-500">
                      Kode Role (huruf kecil)
                    </label>
                    <input
                      type="text"
                      required
                      disabled={plan.id === 'free'}
                      maxLength={40}
                      value={plan.id}
                      onChange={(e) =>
                        handleUpdatePlan(idx, {
                          id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                        })
                      }
                      onBlur={(e) => {
                        const clean = normalizeRoleKey(e.target.value);
                        if (clean !== plan.id && plan.id !== 'free') {
                          handleUpdatePlan(idx, { id: clean === 'admin' ? 'custom' : clean });
                        }
                      }}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs disabled:opacity-60 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">
                      Kuota / Hari (-1 = Unlimited)
                    </label>
                    <input
                      type="number"
                      min={-1}
                      max={10000000}
                      required
                      value={resolvedDailyLimit}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const safe =
                          raw === -1
                            ? -1
                            : Number.isFinite(raw)
                            ? Math.max(1, Math.min(10000000, Math.trunc(raw)))
                            : 10;
                        handleUpdatePlan(idx, { dailyLimit: safe });
                      }}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Target Pengguna</label>
                    <input
                      type="text"
                      required
                      value={plan.audience}
                      onChange={(e) => handleUpdatePlan(idx, { audience: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Nama Paket</label>
                    <input
                      type="text"
                      required
                      value={plan.name}
                      onChange={(e) => handleUpdatePlan(idx, { name: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Harga</label>
                    <input
                      type="text"
                      required
                      value={plan.price}
                      onChange={(e) => handleUpdatePlan(idx, { price: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Periode</label>
                    <input
                      type="text"
                      required
                      value={plan.cadence}
                      onChange={(e) => handleUpdatePlan(idx, { cadence: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] text-slate-500">Teks Tombol</label>
                    <input
                      type="text"
                      required
                      value={plan.buttonLabel}
                      onChange={(e) => handleUpdatePlan(idx, { buttonLabel: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Aksi Tombol</label>
                    <select
                      value={plan.actionType}
                      onChange={(e) =>
                        handleUpdatePlan(idx, {
                          actionType: e.target.value as 'keys' | 'whatsapp',
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    >
                      <option value="whatsapp">Arahkan ke WhatsApp</option>
                      <option value="keys">Arahkan ke Halaman API Key</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={plan.highlighted}
                        onChange={(e) => handleUpdatePlan(idx, { highlighted: e.target.checked })}
                      />
                      <span>Sorot Paket Unggulan</span>
                    </label>
                  </div>
                </div>

                {plan.actionType === 'whatsapp' && (
                  <div>
                    <label className="block text-[11px] text-slate-500">
                      Pesan Otomatis WhatsApp
                    </label>
                    <input
                      type="text"
                      value={plan.whatsappMessage}
                      onChange={(e) =>
                        handleUpdatePlan(idx, { whatsappMessage: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-500">
                    Daftar Fitur (1 baris per poin)
                  </label>
                  <textarea
                    rows={3}
                    value={plan.features.join('\n')}
                    onChange={(e) =>
                      handleUpdatePlan(idx, {
                        features: e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                  />
                </div>
              </div>
              );
            })}
          </div>

          {/* Comparison Table Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Tabel Perbandingan
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.pricingComparisonTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, pricingComparisonTitle: e.target.value }))
                  }
                  className="mt-1 w-full sm:w-72 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleAddComparisonRow}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Baris Tabel</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {draftContent.pricingComparisonRows.map((row, idx) => (
                <div
                  key={`cmp-edit-${idx}`}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-[#0A0A0A] sm:grid-cols-12 items-center"
                >
                  <input
                    type="text"
                    value={row.feature}
                    onChange={(e) => handleUpdateComparisonRow(idx, { feature: e.target.value })}
                    placeholder="Nama Fitur"
                    className="sm:col-span-4 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                  <input
                    type="text"
                    value={row.freeValue}
                    onChange={(e) => handleUpdateComparisonRow(idx, { freeValue: e.target.value })}
                    placeholder="Nilai Free"
                    className="sm:col-span-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                  <input
                    type="text"
                    value={row.proValue}
                    onChange={(e) => handleUpdateComparisonRow(idx, { proValue: e.target.value })}
                    placeholder="Nilai Pro"
                    className="sm:col-span-3 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                  <input
                    type="text"
                    value={row.enterpriseValue}
                    onChange={(e) =>
                      handleUpdateComparisonRow(idx, { enterpriseValue: e.target.value })
                    }
                    placeholder="Nilai Enterprise"
                    className="sm:col-span-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteComparisonRow(idx)}
                    aria-label="Hapus baris"
                    className="sm:col-span-1 flex justify-center text-rose-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {contentErrorMsg ? (
              <span className="text-xs text-rose-500">{contentErrorMsg}</span>
            ) : contentSavedMsg ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>{contentSavedMsg}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Simpan untuk memperbarui paket dan tautan WhatsApp di halaman Pricing.
              </span>
            )}

            <button
              type="submit"
              disabled={savingContent}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              {savingContent ? 'Menyimpan...' : 'Simpan Pengaturan Pricing'}
            </button>
          </div>
        </form>
      )}

      {/* TAB: CIRCULAR SIDEBAR HUB & SUPPORT PAGES */}
      {activeTab === 'hub' && (
        <form onSubmit={handleSaveContentSubmit} className="mt-6 space-y-8">
          {/* 1. Circular Menu Labels */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Label Tombol Sidebar Melingkar (Tengah Layar)
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Atur teks yang muncul saat tombol melingkar beranimasi di sisi kanan diklik.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label Kontak CS
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.hubCsLabel}
                  onChange={(e) => setDraftContent((p) => ({ ...p, hubCsLabel: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label FAQ
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.hubFaqLabel}
                  onChange={(e) => setDraftContent((p) => ({ ...p, hubFaqLabel: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label Sosmed
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.hubSosmedLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, hubSosmedLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Label Public Chat
                </label>
                <input
                  type="text"
                  maxLength={40}
                  required
                  value={draftContent.hubPublicChatLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, hubPublicChatLabel: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 2. Kontak CS Page Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman Kontak CS
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman CS
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.csPageTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, csPageTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Jam Operasional CS (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={draftContent.csResponseHours}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, csResponseHours: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Subjudul Halaman CS
              </label>
              <textarea
                rows={2}
                maxLength={300}
                required
                value={draftContent.csPageSubtitle}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, csPageSubtitle: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Daftar Kanal Kontak CS ({draftContent.csChannels.length}/10)
                </span>
                <button
                  type="button"
                  disabled={draftContent.csChannels.length >= 10}
                  onClick={() =>
                    setDraftContent((p) => ({
                      ...p,
                      csChannels: [
                        ...p.csChannels,
                        {
                          label: 'Kanal Baru',
                          value: '@efemma_cs',
                          url: 'https://',
                          note: '',
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Kanal CS</span>
                </button>
              </div>

              {draftContent.csChannels.map((ch, idx) => (
                <div
                  key={`edit-cs-${idx}`}
                  className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-[#0A0A0A]"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      maxLength={60}
                      value={ch.label}
                      onChange={(e) =>
                        setDraftContent((p) => {
                          const next = [...p.csChannels];
                          next[idx] = { ...next[idx], label: e.target.value };
                          return { ...p, csChannels: next };
                        })
                      }
                      placeholder="Label (mis. WhatsApp CS)"
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                    />
                    <input
                      type="text"
                      maxLength={120}
                      value={ch.value}
                      onChange={(e) =>
                        setDraftContent((p) => {
                          const next = [...p.csChannels];
                          next[idx] = { ...next[idx], value: e.target.value };
                          return { ...p, csChannels: next };
                        })
                      }
                      placeholder="Nomor / Email / Handle"
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={300}
                        value={ch.url}
                        onChange={(e) =>
                          setDraftContent((p) => {
                            const next = [...p.csChannels];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return { ...p, csChannels: next };
                          })
                        }
                        placeholder="https://wa.me/... atau mailto:..."
                        className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraftContent((p) => ({
                            ...p,
                            csChannels: p.csChannels.filter((_, i) => i !== idx),
                          }))
                        }
                        aria-label="Hapus kanal CS"
                        className="rounded border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 dark:border-white/10 dark:bg-[#111111] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={240}
                    value={ch.note}
                    onChange={(e) =>
                      setDraftContent((p) => {
                        const next = [...p.csChannels];
                        next[idx] = { ...next[idx], note: e.target.value };
                        return { ...p, csChannels: next };
                      })
                    }
                    placeholder="Keterangan singkat kanal CS..."
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3. FAQ Page Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman FAQ
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman FAQ
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.faqPageTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, faqPageTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subjudul FAQ
                </label>
                <input
                  type="text"
                  maxLength={300}
                  required
                  value={draftContent.faqPageSubtitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, faqPageSubtitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Daftar Pertanyaan &amp; Jawaban ({draftContent.faqItems.length}/25)
                </span>
                <button
                  type="button"
                  disabled={draftContent.faqItems.length >= 25}
                  onClick={() =>
                    setDraftContent((p) => ({
                      ...p,
                      faqItems: [
                        ...p.faqItems,
                        { question: 'Pertanyaan baru?', answer: 'Tuliskan jawaban di sini.' },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah FAQ</span>
                </button>
              </div>

              {draftContent.faqItems.map((faq, idx) => (
                <div
                  key={`edit-faq-${idx}`}
                  className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-[#0A0A0A]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={200}
                      value={faq.question}
                      onChange={(e) =>
                        setDraftContent((p) => {
                          const next = [...p.faqItems];
                          next[idx] = { ...next[idx], question: e.target.value };
                          return { ...p, faqItems: next };
                        })
                      }
                      placeholder="Pertanyaan FAQ..."
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium dark:border-white/10 dark:bg-[#111111] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((p) => ({
                          ...p,
                          faqItems: p.faqItems.filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Hapus item FAQ"
                      className="rounded border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 dark:border-white/10 dark:bg-[#111111] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={800}
                    value={faq.answer}
                    onChange={(e) =>
                      setDraftContent((p) => {
                        const next = [...p.faqItems];
                        next[idx] = { ...next[idx], answer: e.target.value };
                        return { ...p, faqItems: next };
                      })
                    }
                    placeholder="Jawaban FAQ (mendukung Enter dan [teks](https://...))"
                    className="w-full rounded border border-slate-200 bg-white p-2.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 4. Sosmed Page Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman Sosmed
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman Sosmed
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.sosmedPageTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, sosmedPageTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subjudul Sosmed
                </label>
                <input
                  type="text"
                  maxLength={300}
                  required
                  value={draftContent.sosmedPageSubtitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, sosmedPageSubtitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Daftar Akun Sosial Media ({draftContent.sosmedItems.length}/12)
                </span>
                <button
                  type="button"
                  disabled={draftContent.sosmedItems.length >= 12}
                  onClick={() =>
                    setDraftContent((p) => ({
                      ...p,
                      sosmedItems: [
                        ...p.sosmedItems,
                        {
                          platform: 'Platform Baru',
                          handle: '@username',
                          description: '',
                          url: 'https://',
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Sosmed</span>
                </button>
              </div>

              {draftContent.sosmedItems.map((sm, idx) => (
                <div
                  key={`edit-sm-${idx}`}
                  className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-[#0A0A0A]"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      maxLength={60}
                      value={sm.platform}
                      onChange={(e) =>
                        setDraftContent((p) => {
                          const next = [...p.sosmedItems];
                          next[idx] = { ...next[idx], platform: e.target.value };
                          return { ...p, sosmedItems: next };
                        })
                      }
                      placeholder="Platform (mis. Instagram)"
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                    />
                    <input
                      type="text"
                      maxLength={120}
                      value={sm.handle}
                      onChange={(e) =>
                        setDraftContent((p) => {
                          const next = [...p.sosmedItems];
                          next[idx] = { ...next[idx], handle: e.target.value };
                          return { ...p, sosmedItems: next };
                        })
                      }
                      placeholder="Handle (@username)"
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={300}
                        value={sm.url}
                        onChange={(e) =>
                          setDraftContent((p) => {
                            const next = [...p.sosmedItems];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return { ...p, sosmedItems: next };
                          })
                        }
                        placeholder="https://..."
                        className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraftContent((p) => ({
                            ...p,
                            sosmedItems: p.sosmedItems.filter((_, i) => i !== idx),
                          }))
                        }
                        aria-label="Hapus item sosmed"
                        className="rounded border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 dark:border-white/10 dark:bg-[#111111] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={240}
                    value={sm.description}
                    onChange={(e) =>
                      setDraftContent((p) => {
                        const next = [...p.sosmedItems];
                        next[idx] = { ...next[idx], description: e.target.value };
                        return { ...p, sosmedItems: next };
                      })
                    }
                    placeholder="Deskripsi singkat..."
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-[#111111] dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 5. Public Chat (Soon) Page Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Halaman Public Chat
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Halaman Public Chat
                </label>
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={draftContent.publicChatTitle}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, publicChatTitle: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Badge Status (mis. Soon)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={draftContent.publicChatBadge}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, publicChatBadge: e.target.value }))
                  }
                  placeholder="Soon (kosongkan untuk sembunyikan)"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Subjudul Public Chat
              </label>
              <input
                type="text"
                maxLength={300}
                required
                value={draftContent.publicChatSubtitle}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, publicChatSubtitle: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Deskripsi Lengkap (Multi-baris &amp; Mendukung Tautan)
              </label>
              <textarea
                rows={4}
                maxLength={800}
                value={draftContent.publicChatDescription}
                onChange={(e) =>
                  setDraftContent((p) => ({ ...p, publicChatDescription: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Teks Tombol Aksi (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={draftContent.publicChatCtaLabel}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, publicChatCtaLabel: e.target.value }))
                  }
                  placeholder="Hubungi Kontak CS"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Rute / URL Tombol Aksi
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={draftContent.publicChatCtaUrl}
                  onChange={(e) =>
                    setDraftContent((p) => ({ ...p, publicChatCtaUrl: e.target.value }))
                  }
                  placeholder="#cs atau https://..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {contentErrorMsg ? (
              <span className="text-xs text-rose-500">{contentErrorMsg}</span>
            ) : contentSavedMsg ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>{contentSavedMsg}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Simpan untuk memperbarui menu melingkar serta halaman Kontak CS, FAQ, Sosmed, dan Public Chat.
              </span>
            )}

            <button
              type="submit"
              disabled={savingContent}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              {savingContent ? 'Menyimpan...' : 'Simpan Pengaturan Hub'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: NOTIFICATIONS MANAGER */}
      {activeTab === 'notifikasi' && (
        <div className="mt-6 space-y-8">
          <form
            onSubmit={handleCreateNotifSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#111111] space-y-4"
          >
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Buat Notifikasi Baru
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Judul Notifikasi
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Contoh: Pembaruan Endpoint Kurs Mata Uang"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Jenis Tampilan
                </label>
                <select
                  value={notifPriority}
                  onChange={(e) => setNotifPriority(e.target.value as NotificationPriority)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                >
                  <option value="normal">Normal (Angka Badge Lonceng)</option>
                  <option value="penting">Penting (Pop-up Otomatis 1x)</option>
                  <option value="always">Always (Banner Tetap di Bawah Header)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Isi Pesan Notifikasi / Info (Mendukung Tautan)
              </label>
              <textarea
                rows={3}
                required
                maxLength={1000}
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder="Tuliskan detail pengumuman atau sertakan link https://... / [teks](https://...)"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Mendukung tautan langsung <code className="font-mono">https://...</code> maupun format teks <code className="font-mono">[Kunjungi Situs](https://...)</code> yang langsung dapat diklik pengguna.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {notifFeedback ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {notifFeedback}
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  Normal: badge lonceng / Penting: pop-up 1x saat masuk / Always: banner persisten.
                </span>
              )}

              <button
                type="submit"
                disabled={creatingNotif}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
              >
                {creatingNotif ? 'Menerbitkan...' : 'Terbitkan Notifikasi'}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Daftar Notifikasi Tersimpan
            </h3>
            {notifications.length === 0 ? (
              <div className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-white/10">
                Belum ada notifikasi yang dibuat.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111] min-w-0 overflow-hidden"
                >
                  <div className="space-y-1 min-w-0 flex-1 max-w-2xl break-words">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold uppercase text-sky-600 dark:text-sky-400">
                        {n.priority}
                      </span>
                      <span className="h-3 w-px bg-slate-300 dark:bg-white/15" aria-hidden="true" />
                      <span
                        className={
                          n.active
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        {n.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">
                      {n.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{n.message}</p>
                  </div>

                  <div className="flex w-full sm:w-auto flex-wrap items-center gap-2 sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleNotificationActive(n.id, !n.active)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                    >
                      {n.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNotification(n.id)}
                      aria-label="Hapus notifikasi"
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: USERS & ROLES + BATCH PROCESSING TOOL */}
      {activeTab === 'pengguna' && (() => {
        const selectableAllUsers = allUsers.filter(
          (u) => u.email.toLowerCase() !== ADMIN_EMAIL
        );
        const selectableUidSet = new Set(selectableAllUsers.map((u) => u.uid));
        const effectiveSelectedUids = Array.from(selectedUserUids).filter((uid) =>
          selectableUidSet.has(uid)
        );
        const selectedCount = effectiveSelectedUids.length;

        const suspendedCount = allUsers.filter(
          (u) => Boolean(u.suspended) && u.email.toLowerCase() !== ADMIN_EMAIL
        ).length;

        const filteredUsers = allUsers.filter((u) => {
          if (userRoleFilter === 'selected') {
            if (!selectedUserUids.has(u.uid) || u.email.toLowerCase() === ADMIN_EMAIL) return false;
          } else if (userRoleFilter === 'suspended') {
            if (!u.suspended) return false;
          } else if (userRoleFilter !== 'all' && u.role !== userRoleFilter) {
            return false;
          }
          const q = userSearchQuery.trim().toLowerCase();
          if (!q) return true;
          return (
            u.email.toLowerCase().includes(q) ||
            (u.displayName || '').toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q) ||
            (u.suspendedReason || '').toLowerCase().includes(q)
          );
        });

        const selectableFilteredUsers = filteredUsers.filter(
          (u) => u.email.toLowerCase() !== ADMIN_EMAIL
        );
        const allFilteredSelected =
          selectableFilteredUsers.length > 0 &&
          selectableFilteredUsers.every((u) => selectedUserUids.has(u.uid));

        const toggleUserSelection = (uid: string) => {
          setSelectedUserUids((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) {
              next.delete(uid);
            } else {
              next.add(uid);
            }
            return next;
          });
        };

        const toggleSelectAllFiltered = () => {
          setSelectedUserUids((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
              for (const u of selectableFilteredUsers) {
                next.delete(u.uid);
              }
            } else {
              for (const u of selectableFilteredUsers) {
                next.add(u.uid);
              }
            }
            return next;
          });
        };

        const resolveBatchExpiresAt = (): number => {
          if (batchTargetRole === 'free') return 0;
          if (batchDurationMode === 'permanent') return 0;
          if (batchDurationMode === 'custom_date') {
            return fromDateTimeLocalInput(batchCustomDateLocal);
          }
          const months =
            batchDurationMode === '1m'
              ? 1
              : batchDurationMode === '3m'
              ? 3
              : batchDurationMode === '6m'
              ? 6
              : batchDurationMode === '12m'
              ? 12
              : Math.max(1, Math.min(120, Number(batchCustomMonths) || 1));
          return addMonthsPreservingDateTime(new Date(), months).getTime();
        };

        const handleExecuteBatchRoleUpdate = async () => {
          if (selectedCount === 0 || batchSubmitting) return;
          const targetExpiresAt = resolveBatchExpiresAt();
          if (
            batchTargetRole !== 'free' &&
            batchDurationMode === 'custom_date' &&
            targetExpiresAt <= 0
          ) {
            setRoleFeedback('');
            setRoleErrorFeedback('Pilih tanggal & jam kedaluwarsa yang valid terlebih dahulu.');
            return;
          }
          setBatchSubmitting(true);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onBatchUpdateUsersRole(effectiveSelectedUids, batchTargetRole, {
              roleAssignedAt: Date.now(),
              roleExpiresAt: targetExpiresAt,
              resetCredits: batchAlsoResetCredits,
            });
            const expText =
              batchTargetRole === 'free'
                ? 'tanpa batas (Free)'
                : targetExpiresAt > 0
                ? `hingga ${formatExpiryDateTime(targetExpiresAt)}`
                : 'Permanen';
            const creditSuffix = batchAlsoResetCredits ? ' + kredit harian direset ke 0' : '';
            setRoleFeedback(
              `Batch selesai: ${selectedCount} pengguna diperbarui ke role ${batchTargetRole.toUpperCase()} (${expText})${creditSuffix}.`
            );
            setSelectedUserUids(new Set());
            if (userRoleFilter === 'selected') setUserRoleFilter('all');
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal memproses batch role: ${err.message}`
                : 'Gagal memproses pembaruan role batch.'
            );
          } finally {
            setBatchSubmitting(false);
          }
        };

        const handleExecuteBatchCreditReset = async () => {
          if (selectedCount === 0 || batchSubmitting) return;
          if (!batchCreditResetUsage && batchCreditLimitMode === 'keep') {
            setRoleFeedback('');
            setRoleErrorFeedback(
              'Aktifkan reset pemakaian harian atau pilih mode pengaturan ulang batas kredit.'
            );
            return;
          }
          const parsedCustom = Number(batchCustomDailyLimit);
          if (
            batchCreditLimitMode === 'custom' &&
            (!Number.isFinite(parsedCustom) || (parsedCustom !== -1 && parsedCustom < 1))
          ) {
            setRoleFeedback('');
            setRoleErrorFeedback(
              'Batas kredit kustom harus berupa angka >= 1 atau -1 untuk Unlimited.'
            );
            return;
          }
          setBatchSubmitting(true);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onBatchResetUserCredits(effectiveSelectedUids, {
              resetUsage: batchCreditResetUsage,
              dailyLimitMode: batchCreditLimitMode,
              customDailyLimit: Math.trunc(parsedCustom),
            });
            const parts: string[] = [];
            if (batchCreditResetUsage) parts.push('pemakaian harian direset ke 0');
            if (batchCreditLimitMode === 'sync_role') {
              parts.push('batas kredit disinkronkan ke default role Pricing');
            } else if (batchCreditLimitMode === 'custom') {
              parts.push(
                parsedCustom === -1
                  ? 'batas kredit diset ke Unlimited'
                  : `batas kredit diset ke ${Math.trunc(parsedCustom)}/hari`
              );
            }
            setRoleFeedback(
              `Batch selesai untuk ${selectedCount} pengguna: ${parts.join(' dan ')}.`
            );
            setSelectedUserUids(new Set());
            if (userRoleFilter === 'selected') setUserRoleFilter('all');
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal memproses batch kredit: ${err.message}`
                : 'Gagal memproses reset batas kredit batch.'
            );
          } finally {
            setBatchSubmitting(false);
          }
        };

        const handleExecuteBatchSuspend = async (suspend: boolean) => {
          if (selectedCount === 0 || batchSubmitting) return;
          setBatchSubmitting(true);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onBatchSuspendUsers(
              effectiveSelectedUids,
              suspend,
              suspend ? batchSuspendReason.trim() : ''
            );
            setRoleFeedback(
              suspend
                ? `Batch selesai: ${selectedCount} akun pengguna berhasil disuspend.`
                : `Batch selesai: ${selectedCount} akun pengguna berhasil diaktifkan kembali.`
            );
            if (suspend) setBatchSuspendReason('');
            setSelectedUserUids(new Set());
            if (userRoleFilter === 'selected') setUserRoleFilter('all');
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal memproses status suspend batch: ${err.message}`
                : 'Gagal memproses status suspend batch.'
            );
          } finally {
            setBatchSubmitting(false);
          }
        };

        const handleConfirmSuspendSingle = async () => {
          if (!suspendTargetUser || submittingSuspendUid) return;
          setSubmittingSuspendUid(suspendTargetUser.uid);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onSuspendUser(suspendTargetUser.uid, true, suspendReasonInput.trim());
            setRoleFeedback(`Akun ${suspendTargetUser.email} berhasil disuspend.`);
            setSuspendTargetUser(null);
            setSuspendReasonInput('');
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal mensuspend akun: ${err.message}`
                : 'Gagal mensuspend akun.'
            );
          } finally {
            setSubmittingSuspendUid(null);
          }
        };

        const handleQuickUnsuspend = async (target: UserProfile) => {
          if (submittingSuspendUid) return;
          setSubmittingSuspendUid(target.uid);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onSuspendUser(target.uid, false, '');
            setRoleFeedback(`Suspend akun ${target.email} telah dicabut dan kembali aktif.`);
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal mengaktifkan akun: ${err.message}`
                : 'Gagal mengaktifkan kembali akun.'
            );
          } finally {
            setSubmittingSuspendUid(null);
          }
        };

        const handleConfirmDeleteAccount = async () => {
          if (!deleteTargetUser || deletingUserUid) return;
          const target = deleteTargetUser;
          setDeletingUserUid(target.uid);
          setRoleFeedback('');
          setRoleErrorFeedback('');
          try {
            await onDeleteUserAccount(target.uid);
            setSelectedUserUids((prev) => {
              if (!prev.has(target.uid)) return prev;
              const next = new Set(prev);
              next.delete(target.uid);
              return next;
            });
            if (editingUserUid === target.uid) setEditingUserUid(null);
            setDeleteTargetUser(null);
            setRoleFeedback(`Akun ${target.email} beserta API Key & datanya telah dihapus dari daftar pengguna terdaftar.`);
          } catch (err) {
            setRoleErrorFeedback(
              err instanceof Error
                ? `Gagal menghapus akun: ${err.message}`
                : 'Gagal menghapus akun pengguna.'
            );
          } finally {
            setDeletingUserUid(null);
          }
        };

        const previewBatchExpiresAt = resolveBatchExpiresAt();

        return (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Daftar Pengguna, Pemrosesan Batch &amp; Masa Aktif Role
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Centang beberapa pengguna untuk memperbarui role, masa aktif, maupun mengatur ulang pemakaian &amp; batas kredit harian secara serentak, atau atur per individu di baris tabel.
              </p>
            </div>
            {(roleFeedback || roleErrorFeedback) && (
              <div
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  roleErrorFeedback
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {roleErrorFeedback || roleFeedback}
              </div>
            )}
          </div>

          {/* Filter & Multi-Select Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#111111]">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setUserRoleFilter('all')}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  userRoleFilter === 'all'
                    ? 'border-sky-500 bg-sky-500/10 font-semibold text-sky-700 dark:text-sky-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300'
                }`}
              >
                Semua ({allUsers.length})
              </button>
              {assignableRoles.map((opt) => {
                const count = allUsers.filter((u) => u.role === opt.role).length;
                return (
                  <button
                    key={`filter-${opt.role}`}
                    type="button"
                    onClick={() => setUserRoleFilter(opt.role)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] uppercase transition-colors cursor-pointer ${
                      userRoleFilter === opt.role
                        ? 'border-sky-500 bg-sky-500/10 font-semibold text-sky-700 dark:text-sky-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300'
                    }`}
                  >
                    {opt.role} ({count})
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUserRoleFilter('suspended')}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  userRoleFilter === 'suspended'
                    ? 'border-rose-500 bg-rose-500/15 font-semibold text-rose-700 dark:text-rose-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300'
                }`}
              >
                Disuspend ({suspendedCount})
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('selected')}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    userRoleFilter === 'selected'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Terpilih ({selectedCount})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Cari email, nama, atau role..."
                className="w-full sm:w-60 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
              {selectableAllUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedUserUids(new Set(selectableAllUsers.map((u) => u.uid)))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-200 cursor-pointer"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-sky-500" />
                  <span>Pilih Semua ({selectableAllUsers.length})</span>
                </button>
              )}
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserUids(new Set());
                    if (userRoleFilter === 'selected') setUserRoleFilter('all');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-500/20 dark:text-rose-300 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Batal Pilih</span>
                </button>
              )}
            </div>
          </div>

          {/* Batch Processing Action Panel */}
          <div
            className={`rounded-xl border p-3.5 sm:p-4 transition-colors min-w-0 overflow-hidden ${
              selectedCount > 0
                ? 'border-sky-500/40 bg-sky-500/[0.04] dark:bg-sky-500/[0.05]'
                : 'border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-[#111111]/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-display text-xs font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                    <span>Alat Pemrosesan Batch</span>
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-700 dark:text-sky-300">
                      {selectedCount} Pengguna Dipilih
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedCount === 0
                      ? 'Centang baris pengguna pada tabel di bawah untuk mengaktifkan aksi batch (akun Owner utama dilindungi dari ubah massal).'
                      : 'Pilih aksi untuk diterapkan serentak ke seluruh pengguna terpilih (API Key masing-masing pengguna tetap aman tidak diubah).'}
                  </p>
                </div>
              </div>

              {selectedCount > 0 && (
                <div className="flex w-full sm:w-auto flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-[#0A0A0A]">
                  <button
                    type="button"
                    onClick={() => setBatchActionTab('role')}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      batchActionTab === 'role'
                        ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Perbarui Role Serentak
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchActionTab('credits')}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      batchActionTab === 'credits'
                        ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Reset &amp; Batas Kredit Serentak
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchActionTab('status')}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      batchActionTab === 'status'
                        ? 'bg-rose-600 text-white dark:bg-rose-500 dark:text-slate-950'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Suspend / Status Serentak
                  </button>
                </div>
              )}
            </div>

            {selectedCount > 0 && batchActionTab === 'role' && (
              <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-white/10">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      1. Target Role Baru ({selectedCount} Pengguna)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {assignableRoles.map((opt) => (
                        <button
                          key={`batch-role-${opt.role}`}
                          type="button"
                          onClick={() => {
                            setBatchTargetRole(opt.role);
                            if (opt.role === 'free' || opt.role === 'admin') {
                              setBatchDurationMode('permanent');
                            } else if (batchDurationMode === 'permanent') {
                              setBatchDurationMode('1m');
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors cursor-pointer ${
                            batchTargetRole === opt.role
                              ? 'border-sky-500 bg-sky-500/15 font-bold text-sky-700 dark:text-sky-300'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300'
                          }`}
                        >
                          <span className="uppercase">{opt.role}</span>{' '}
                          <span className="text-[10px] opacity-75">
                            ({opt.dailyLimit === -1 ? 'unlimited' : `${opt.dailyLimit}/hr`})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {batchTargetRole !== 'free' && (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        2. Masa Aktif Role
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { id: '1m', label: '1 Bln (Tgl & Jam Sama)' },
                            { id: '3m', label: '3 Bln' },
                            { id: '6m', label: '6 Bln' },
                            { id: '12m', label: '12 Bln' },
                            { id: 'permanent', label: 'Permanen' },
                            { id: 'custom_months', label: 'Custom Bln' },
                            { id: 'custom_date', label: 'Tgl Spesifik' },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setBatchDurationMode(mode.id)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                              batchDurationMode === mode.id
                                ? 'border-sky-500 bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300'
                                : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-300'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>

                      {batchDurationMode === 'custom_months' && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            min={1}
                            max={120}
                            value={batchCustomMonths}
                            onChange={(e) => setBatchCustomMonths(e.target.value)}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                          />
                          <span className="text-[11px] text-slate-500">bulan dari sekarang</span>
                        </div>
                      )}

                      {batchDurationMode === 'custom_date' && (
                        <div className="pt-1">
                          <input
                            type="datetime-local"
                            value={batchCustomDateLocal}
                            onChange={(e) => setBatchCustomDateLocal(e.target.value)}
                            className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
                  <div className="space-y-1.5">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchAlsoResetCredits}
                        onChange={(e) => setBatchAlsoResetCredits(e.target.checked)}
                      />
                      <span>Sekaligus reset pemakaian kredit hari ini ke 0</span>
                    </label>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Ringkasan: Set <strong>{selectedCount}</strong> pengguna ke{' '}
                      <strong className="uppercase">{batchTargetRole}</strong> (
                      {batchTargetRole === 'free'
                        ? 'Reset ke Free 10/hari'
                        : previewBatchExpiresAt > 0
                        ? `Exp: ${formatExpiryDateTime(previewBatchExpiresAt)}`
                        : 'Permanen'}
                      )
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={batchSubmitting}
                    onClick={handleExecuteBatchRoleUpdate}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>
                      {batchSubmitting
                        ? 'Memproses Batch...'
                        : `Terapkan Role ke ${selectedCount} Pengguna`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {selectedCount > 0 && batchActionTab === 'credits' && (
              <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-white/10">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0A0A0A]">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                      1. Reset Pemakaian Kredit Hari Ini
                    </div>
                    <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchCreditResetUsage}
                        onChange={(e) => setBatchCreditResetUsage(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Atur ulang pemakaian hari ini menjadi <strong>0</strong> untuk {selectedCount}{' '}
                        pengguna terpilih (kuota penuh kembali tersedia hari ini).
                      </span>
                    </label>
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0A0A0A]">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                      2. Atur Ulang Batas Kredit Harian (Daily Limit)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'keep', label: 'Biarkan Limit Saat Ini' },
                          { id: 'sync_role', label: 'Sinkronkan Default Role Pricing' },
                          { id: 'custom', label: 'Tetapkan Batas Kustom' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBatchCreditLimitMode(opt.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                            batchCreditLimitMode === opt.id
                              ? 'border-sky-500 bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300'
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {batchCreditLimitMode === 'custom' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          type="number"
                          min={-1}
                          max={10000000}
                          value={batchCustomDailyLimit}
                          onChange={(e) => setBatchCustomDailyLimit(e.target.value)}
                          className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#111111] dark:text-white"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          kredit/hari (<code className="font-mono">-1</code> = Unlimited)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Perubahan diterapkan atomik ke Firestore &amp; langsung disinkronkan ke API Key Gateway.
                  </div>

                  <button
                    type="button"
                    disabled={
                      batchSubmitting || (!batchCreditResetUsage && batchCreditLimitMode === 'keep')
                    }
                    onClick={handleExecuteBatchCreditReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${batchSubmitting ? 'animate-spin' : ''}`} />
                    <span>
                      {batchSubmitting
                        ? 'Memproses Batch...'
                        : `Jalankan Reset & Limit (${selectedCount} Pengguna)`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {selectedCount > 0 && batchActionTab === 'status' && (
              <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-white/10">
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Alasan Suspend (Opsional, maksimal 300 karakter)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={batchSuspendReason}
                    onChange={(e) => setBatchSuspendReason(e.target.value)}
                    placeholder="Contoh: Aktivitas spam API atau pelanggaran ketentuan layanan"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Akun yang disuspend langsung diblokir dari API Key Gateway, Playground, dan rotasi kunci.
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={batchSubmitting}
                      onClick={() => handleExecuteBatchSuspend(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Aktifkan Terpilih ({selectedCount})</span>
                    </button>
                    <button
                      type="button"
                      disabled={batchSubmitting}
                      onClick={() => handleExecuteBatchSuspend(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Suspend Terpilih ({selectedCount})</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua pengguna yang tampil"
                      checked={allFilteredSelected}
                      disabled={selectableFilteredUsers.length === 0}
                      onChange={toggleSelectAllFiltered}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-sky-500 cursor-pointer disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Pengguna</th>
                  <th className="px-4 py-3 font-medium">Role &amp; Masa Aktif</th>
                  <th className="px-4 py-3 font-medium">Sisa Timer</th>
                  <th className="px-4 py-3 font-medium">Kredit Hari Ini</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      Tidak ada pengguna yang cocok dengan filter saat ini.
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u) => {
                  const isSuperAdmin = u.email.toLowerCase() === ADMIN_EMAIL;
                  const isProtectedAccount = isSuperAdmin || u.uid === userProfile.uid;
                  const isSelected = !isSuperAdmin && selectedUserUids.has(u.uid);
                  const currentExpiresAt = toEpochMs(u.roleExpiresAt);
                  const isEditing = editingUserUid === u.uid;

                  const openRoleEditor = (nextRole?: UserRole) => {
                    const targetRole = nextRole ?? u.role;
                    const now = new Date();
                    const defaultNextMonth = addMonthsPreservingDateTime(now, 1).getTime();
                    setEditingUserUid(u.uid);
                    setDraftRole(targetRole);
                    setDraftCustomMonths('1');
                    setDraftExtendMonths('1');
                    setRoleFeedback('');
                    setRoleErrorFeedback('');
                    if (targetRole === 'free') {
                      setDraftExpiresAt(0);
                    } else if (nextRole && nextRole !== u.role) {
                      setDraftExpiresAt(
                        targetRole !== 'admin' ? defaultNextMonth : 0
                      );
                    } else if (currentExpiresAt > 0) {
                      setDraftExpiresAt(currentExpiresAt);
                    } else {
                      setDraftExpiresAt(targetRole !== 'admin' ? defaultNextMonth : 0);
                    }
                  };

                  const handleSelectRoleQuick = async (selected: UserRole) => {
                    if (isSuperAdmin) return;
                    if (selected === 'free') {
                      setSavingUserUid(u.uid);
                      setRoleFeedback('');
                      setRoleErrorFeedback('');
                      try {
                        await onUpdateUserRole(u.uid, 'free', {
                          roleAssignedAt: Date.now(),
                          roleExpiresAt: 0,
                        });
                        if (editingUserUid === u.uid) setEditingUserUid(null);
                        setRoleFeedback(
                          `Role ${u.email} direset ke Free (API Key tetap sama).`
                        );
                      } catch (err) {
                        setRoleErrorFeedback(
                          err instanceof Error ? `Gagal memperbarui role: ${err.message}` : 'Gagal memperbarui role.'
                        );
                      } finally {
                        setSavingUserUid(null);
                      }
                      return;
                    }
                    // When setting Pro (or timed Admin), open duration editor pre-filled to exact same date & time next month
                    openRoleEditor(selected);
                  };

                  const handleQuickExtendOneMonth = async () => {
                    if (isSuperAdmin || u.role === 'free') return;
                    setSavingUserUid(u.uid);
                    setRoleFeedback('');
                    setRoleErrorFeedback('');
                    try {
                      const base =
                        currentExpiresAt > Date.now() ? new Date(currentExpiresAt) : new Date();
                      const nextExp = addMonthsPreservingDateTime(base, 1).getTime();
                      await onUpdateUserRole(u.uid, u.role, {
                        roleAssignedAt: toEpochMs(u.roleAssignedAt) || Date.now(),
                        roleExpiresAt: nextExp,
                      });
                      if (editingUserUid === u.uid) {
                        setDraftExpiresAt(nextExp);
                      }
                      setRoleFeedback(
                        `Masa aktif ${u.email} ditambah +1 bulan hingga ${formatExpiryDateTime(
                          nextExp
                        )}.`
                      );
                    } catch (err) {
                      setRoleErrorFeedback(
                        err instanceof Error ? `Gagal memperpanjang role: ${err.message}` : 'Gagal memperpanjang role.'
                      );
                    } finally {
                      setSavingUserUid(null);
                    }
                  };

                  const handleSaveDraftRole = async () => {
                    setSavingUserUid(u.uid);
                    setRoleFeedback('');
                    setRoleErrorFeedback('');
                    try {
                      const finalExpiresAt = draftRole === 'free' ? 0 : Math.max(0, draftExpiresAt);
                      await onUpdateUserRole(u.uid, draftRole, {
                        roleAssignedAt: Date.now(),
                        roleExpiresAt: finalExpiresAt,
                      });
                      setEditingUserUid(null);
                      setRoleFeedback(
                        finalExpiresAt > 0
                          ? `Role ${u.email} diset ke ${draftRole.toUpperCase()} hingga ${formatExpiryDateTime(
                              finalExpiresAt
                            )}.`
                          : `Role ${u.email} diset ke ${draftRole.toUpperCase()}.`
                      );
                    } catch (err) {
                      setRoleErrorFeedback(
                        err instanceof Error ? `Gagal menyimpan role: ${err.message}` : 'Gagal menyimpan role.'
                      );
                    } finally {
                      setSavingUserUid(null);
                    }
                  };

                  return (
                    <Fragment key={u.uid}>
                      <tr
                        className={
                          isEditing
                            ? 'bg-sky-500/[0.06]'
                            : isSelected
                            ? 'bg-sky-500/[0.04]'
                            : undefined
                        }
                      >
                        <td className="w-10 px-3 py-3 text-center">
                          {isSuperAdmin ? (
                            <span
                              title="Owner utama dilindungi dari pemrosesan batch"
                              className="inline-flex items-center justify-center text-amber-500"
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${u.email}`}
                              checked={isSelected}
                              onChange={() => toggleUserSelection(u.uid)}
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-sky-500 cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900 dark:text-white">{u.email}</span>
                            {u.suspended && (
                              <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                <Ban className="h-2.5 w-2.5" />
                                <span>DISUSPEND</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.displayName}</div>
                          {u.suspended && u.suspendedReason && (
                            <div className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                              Alasan: {u.suspendedReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          <select
                            value={u.role}
                            disabled={isSuperAdmin || savingUserUid === u.uid}
                            onChange={(e) => handleSelectRoleQuick(e.target.value as UserRole)}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                          >
                            {assignableRoles.map((opt) => (
                              <option key={opt.role} value={opt.role}>
                                {opt.role} ({opt.dailyLimit === -1 ? 'unlimited' : `${opt.dailyLimit}/hr`})
                              </option>
                            ))}
                            {!assignableRoles.some((opt) => opt.role === u.role) && (
                              <option value={u.role}>
                                {u.role} ({u.dailyLimit === -1 ? 'unlimited' : `${u.dailyLimit}/hr`})
                              </option>
                            )}
                          </select>
                          {!isSuperAdmin && u.role !== 'free' && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {currentExpiresAt > 0
                                ? `Exp: ${formatExpiryDateTime(currentExpiresAt)}`
                                : 'Permanen (tanpa batas)'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          <AdminUserCountdownCell
                            role={u.role}
                            isSuperAdmin={isSuperAdmin}
                            expiresAtMs={currentExpiresAt}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {u.role === 'admin' || u.dailyLimit === -1
                            ? `${u.creditsUsedToday} / Unlimited`
                            : `${u.creditsUsedToday} / ${u.dailyLimit}`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {!isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  isEditing ? setEditingUserUid(null) : openRoleEditor()
                                }
                                className="rounded border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-300 cursor-pointer"
                              >
                                {isEditing ? 'Tutup Atur' : 'Atur Durasi'}
                              </button>
                            )}
                            {!isSuperAdmin && u.role !== 'free' && (
                              <button
                                type="button"
                                disabled={savingUserUid === u.uid}
                                onClick={handleQuickExtendOneMonth}
                                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300 cursor-pointer"
                              >
                                +1 Bln
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onResetUserCredits(u.uid)}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                            >
                              Reset Kredit
                            </button>
                            {!isProtectedAccount && (
                              <>
                                {u.suspended ? (
                                  <button
                                    type="button"
                                    disabled={submittingSuspendUid === u.uid}
                                    onClick={() => handleQuickUnsuspend(u)}
                                    className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300 cursor-pointer"
                                  >
                                    <UserCheck className="h-3 w-3" />
                                    <span>Aktifkan</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={submittingSuspendUid === u.uid}
                                    onClick={() => {
                                      setSuspendTargetUser(u);
                                      setSuspendReasonInput(u.suspendedReason || '');
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300 cursor-pointer"
                                  >
                                    <Ban className="h-3 w-3" />
                                    <span>Suspend</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={deletingUserUid === u.uid}
                                  onClick={() => setDeleteTargetUser(u)}
                                  aria-label={`Hapus akun ${u.email}`}
                                  className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300 cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Hapus</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && !isSuperAdmin && (
                        <tr className="bg-slate-50/80 dark:bg-[#0E0E0E]">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 dark:border-white/10 dark:bg-[#111111]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-display text-xs font-bold text-slate-900 dark:text-white">
                                    Atur Role &amp; Masa Aktif — {u.email}
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    Waktu admin saat ini: <AdminLiveClockText />. Otomatis bulan berikutnya memakai tanggal &amp; jam yang sama.
                                  </div>
                                </div>
                                <span className="rounded border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:text-slate-300">
                                  API Key Tetap Sama ({u.apiKey.slice(0, 12)}...)
                                </span>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    1. Pilih Role Target
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    {assignableRoles.map((opt) => (
                                      <button
                                        key={opt.role}
                                        type="button"
                                        onClick={() => {
                                          setDraftRole(opt.role);
                                          if (opt.role === 'free') {
                                            setDraftExpiresAt(0);
                                          } else if (opt.role !== 'admin' && draftExpiresAt <= 0) {
                                            setDraftExpiresAt(
                                              addMonthsPreservingDateTime(new Date(), 1).getTime()
                                            );
                                          }
                                        }}
                                        className={`rounded-lg border px-3 py-1.5 font-mono text-xs uppercase cursor-pointer ${
                                          draftRole === opt.role
                                            ? 'border-sky-500 bg-sky-500/15 font-bold text-sky-700 dark:text-sky-300'
                                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-400'
                                        }`}
                                      >
                                        {opt.role}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {draftRole !== 'free' && (
                                  <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                      2. Preset Durasi dari Sekarang (Tanggal &amp; Jam Sama)
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {[1, 2, 3, 6, 12].map((m) => (
                                        <button
                                          key={m}
                                          type="button"
                                          onClick={() => {
                                            setDraftCustomMonths(String(m));
                                            setDraftExpiresAt(
                                              addMonthsPreservingDateTime(new Date(), m).getTime()
                                            );
                                          }}
                                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                                        >
                                          {m} Bulan
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        onClick={() => setDraftExpiresAt(0)}
                                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                                          draftExpiresAt === 0
                                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-400'
                                        }`}
                                      >
                                        Permanen
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {draftRole !== 'free' && (
                                <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-3 md:grid-cols-3 dark:border-white/10">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                      Custom Jumlah Bulan (dari sekarang)
                                    </label>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={draftCustomMonths}
                                        onChange={(e) => setDraftCustomMonths(e.target.value)}
                                        className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const m = Math.max(1, Math.min(120, Number(draftCustomMonths) || 1));
                                          setDraftExpiresAt(
                                            addMonthsPreservingDateTime(new Date(), m).getTime()
                                          );
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 cursor-pointer"
                                      >
                                        Set {draftCustomMonths || 1} Bln
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                      Tambah (+) Masa Aktif ke Sisa Saat Ini
                                    </label>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={draftExtendMonths}
                                        onChange={(e) => setDraftExtendMonths(e.target.value)}
                                        className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const m = Math.max(1, Math.min(120, Number(draftExtendMonths) || 1));
                                          const base =
                                            draftExpiresAt > Date.now()
                                              ? new Date(draftExpiresAt)
                                              : new Date();
                                          setDraftExpiresAt(
                                            addMonthsPreservingDateTime(base, m).getTime()
                                          );
                                        }}
                                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 cursor-pointer"
                                      >
                                        +{draftExtendMonths || 1} Bln
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                      Custom Tanggal &amp; Jam Exp Spesifik
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={
                                        draftExpiresAt > 0
                                          ? toDateTimeLocalInput(draftExpiresAt)
                                          : ''
                                      }
                                      onChange={(e) =>
                                        setDraftExpiresAt(fromDateTimeLocalInput(e.target.value))
                                      }
                                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                                  {draftRole === 'free' ? (
                                    <span>Role akan diset ke Free (10 kredit/hari, API Key tidak berubah).</span>
                                  ) : draftExpiresAt > 0 ? (
                                    <span>
                                      Target berakhir: <strong>{formatExpiryDateTime(draftExpiresAt)}</strong>{' '}
                                      <AdminDraftCountdownInline draftExpiresAt={draftExpiresAt} />
                                    </span>
                                  ) : (
                                    <span>Target masa aktif: <strong>Permanen (tanpa batas waktu)</strong></span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingUserUid(null)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingUserUid === u.uid}
                                    onClick={handleSaveDraftRole}
                                    className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                                  >
                                    {savingUserUid === u.uid ? 'Menyimpan...' : 'Simpan Role & Masa Aktif'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Suspend Account Confirmation Modal */}
          <AnimatePresence>
            {suspendTargetUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/15 dark:bg-[#111111]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Ban className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          Suspend Akun Pengguna
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {suspendTargetUser.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuspendTargetUser(null)}
                      aria-label="Tutup modal suspend"
                      className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    Saat disuspend, pengguna tidak dapat menjalankan endpoint API, menggunakan Playground, maupun membuat/memutar API Key baru hingga diaktifkan kembali.
                  </p>

                  <div className="mt-4">
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Alasan Suspend (Opsional)
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={suspendReasonInput}
                      onChange={(e) => setSuspendReasonInput(e.target.value)}
                      placeholder="Contoh: Aktivitas spam API atau pelanggaran ketentuan"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSuspendTargetUser(null)}
                      className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={submittingSuspendUid === suspendTargetUser.uid}
                      onClick={handleConfirmSuspendSingle}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                    >
                      {submittingSuspendUid === suspendTargetUser.uid
                        ? 'Menyuspend...'
                        : 'Ya, Suspend Akun'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Delete Account Confirmation Modal */}
          <AnimatePresence>
            {deleteTargetUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-white p-6 shadow-2xl dark:bg-[#111111]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <Trash2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          Hapus Akun Terdaftar
                        </h3>
                        <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">
                          {deleteTargetUser.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetUser(null)}
                      aria-label="Tutup modal hapus akun"
                      className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    Profil pengguna, riwayat pemakaian API, status notifikasi terbaca, serta API Key milik{' '}
                    <strong className="text-slate-900 dark:text-white">{deleteTargetUser.email}</strong>{' '}
                    akan dihapus dari daftar akun terdaftar dan langsung dicabut aksesnya di API Gateway.
                  </p>

                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteTargetUser(null)}
                      className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={deletingUserUid === deleteTargetUser.uid}
                      onClick={handleConfirmDeleteAccount}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                    >
                      {deletingUserUid === deleteTargetUser.uid
                        ? 'Menghapus...'
                        : 'Hapus Akun Permanen'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
        );
      })()}
        </motion.div>
    </div>
  );
}

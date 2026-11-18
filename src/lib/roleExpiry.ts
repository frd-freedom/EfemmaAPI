import {
  DEFAULT_SITE_CONTENT,
  FREE_DAILY_LIMIT,
  PRO_DAILY_LIMIT,
  PricingPlanItem,
  SiteContent,
  UserRole,
} from '../types/app';

/**
 * Adds `months` calendar months to `baseDate`, preserving the exact day-of-month,
 * hour, minute, second, and millisecond (clamping only when the target month has
 * fewer days, e.g. Jan 31 -> Feb 28/29).
 */
export function addMonthsPreservingDateTime(baseDate: Date, months: number): Date {
  const safeMonths = Number.isFinite(months) ? Math.max(0, Math.trunc(months)) : 1;
  const targetYear = baseDate.getFullYear();
  const targetMonthIndex = baseDate.getMonth() + safeMonths;
  const originalDay = baseDate.getDate();

  const resolvedMonthStart = new Date(targetYear, targetMonthIndex, 1);
  const lastDayOfTargetMonth = new Date(
    resolvedMonthStart.getFullYear(),
    resolvedMonthStart.getMonth() + 1,
    0
  ).getDate();

  const clampedDay = Math.min(originalDay, lastDayOfTargetMonth);

  return new Date(
    resolvedMonthStart.getFullYear(),
    resolvedMonthStart.getMonth(),
    clampedDay,
    baseDate.getHours(),
    baseDate.getMinutes(),
    baseDate.getSeconds(),
    baseDate.getMilliseconds()
  );
}

/**
 * Normalizes Firestore timestamp, ISO string, or integer epoch milliseconds to epoch ms.
 * Returns 0 when absent or invalid.
 */
export function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && asNum > 0) return Math.trunc(asNum);
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const sec = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(sec) && sec > 0) return Math.trunc(sec * 1000);
  }
  return 0;
}

export interface RoleCountdown {
  hasExpiry: boolean;
  expired: boolean;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  summary: string;
  compactSummary: string;
}

export function getRoleCountdown(expiresAtMs: number, nowMs: number = Date.now()): RoleCountdown {
  if (!expiresAtMs || expiresAtMs <= 0) {
    return {
      hasExpiry: false,
      expired: false,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      summary: 'Permanen',
      compactSummary: 'Permanen',
    };
  }

  if (nowMs >= expiresAtMs) {
    return {
      hasExpiry: true,
      expired: true,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      summary: '0 bulan, 0 hari, 0 jam (Kedaluwarsa)',
      compactSummary: 'Kedaluwarsa',
    };
  }

  const startDate = new Date(nowMs);
  let months = 0;
  while (months < 1200) {
    const candidate = addMonthsPreservingDateTime(startDate, months + 1).getTime();
    if (candidate <= expiresAtMs) {
      months += 1;
    } else {
      break;
    }
  }

  const cursorMs = addMonthsPreservingDateTime(startDate, months).getTime();
  const remMs = Math.max(0, expiresAtMs - cursorMs);

  const days = Math.floor(remMs / 86_400_000);
  const hours = Math.floor((remMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remMs % 3_600_000) / 60_000);
  const seconds = Math.floor((remMs % 60_000) / 1000);

  const summary =
    months === 0 && days === 0 && hours === 0
      ? `0 bulan, 0 hari, 0 jam (${minutes} menit ${seconds} dtk)`
      : `${months} bulan, ${days} hari, ${hours} jam`;

  const compactSummary =
    months === 0 && days === 0 && hours === 0
      ? `${minutes} mnt ${seconds} dtk`
      : `${months} bln ${days} hr ${hours} jam`;

  return {
    hasExpiry: true,
    expired: false,
    months,
    days,
    hours,
    minutes,
    seconds,
    summary,
    compactSummary,
  };
}

export function formatExpiryDateTime(expiresAtMs: number): string {
  if (!expiresAtMs || expiresAtMs <= 0) return 'Tidak ada batas waktu';
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(expiresAtMs))} WIB`;
}

export function toDateTimeLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function fromDateTimeLocalInput(value: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

export function normalizeRoleKey(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 40);
  return slug || 'custom';
}

export function inferPlanDailyLimit(
  plan: Pick<PricingPlanItem, 'id' | 'name' | 'features' | 'dailyLimit'>
): number {
  if (typeof plan.dailyLimit === 'number' && Number.isFinite(plan.dailyLimit)) {
    const n = Math.trunc(plan.dailyLimit);
    if (n === -1) return -1;
    if (n >= 1 && n <= 10_000_000) return n;
  }
  const key = normalizeRoleKey(plan.id || plan.name || '');
  const lowerName = (plan.name || '').toLowerCase();
  const joinedFeatures = Array.isArray(plan.features) ? plan.features.join(' ').toLowerCase() : '';
  if (key === 'free' || lowerName === 'free') return FREE_DAILY_LIMIT;
  if (key === 'enterprise' || lowerName.includes('enterprise') || joinedFeatures.includes('unlimited')) {
    return -1;
  }
  if (key === 'pro') return PRO_DAILY_LIMIT;
  return PRO_DAILY_LIMIT;
}

export interface PricingRoleOption {
  role: string;
  label: string;
  dailyLimit: number;
}

export function getPricingRoles(pricingPlans?: PricingPlanItem[]): PricingRoleOption[] {
  const source =
    Array.isArray(pricingPlans) && pricingPlans.length > 0
      ? pricingPlans
      : DEFAULT_SITE_CONTENT.pricingPlans;
  const seen = new Set<string>();
  const out: PricingRoleOption[] = [];
  for (const plan of source) {
    if (!plan) continue;
    const role = normalizeRoleKey(plan.id || plan.name || '');
    if (!role || role === 'admin' || seen.has(role)) continue;
    seen.add(role);
    out.push({
      role,
      label: plan.name?.trim() || role.toUpperCase(),
      dailyLimit: inferPlanDailyLimit(plan),
    });
  }
  return out;
}

export function getDefaultPrivateRoles(pricingPlans?: PricingPlanItem[]): string[] {
  const roles = getPricingRoles(pricingPlans)
    .map((p) => p.role)
    .filter((r) => r !== 'free');
  return roles.length > 0 ? roles : ['pro', 'enterprise'];
}

export function resolveRoleDailyLimit(role: string, pricingPlans?: PricingPlanItem[]): number {
  const norm = normalizeRoleKey(role);
  if (norm === 'admin') return -1;
  const match = getPricingRoles(pricingPlans).find((p) => p.role === norm);
  if (match) return match.dailyLimit;
  if (norm === 'free') return FREE_DAILY_LIMIT;
  if (norm === 'enterprise') return -1;
  return PRO_DAILY_LIMIT;
}

export function getRoleDisplayLabel(role: string, pricingPlans?: PricingPlanItem[]): string {
  const norm = normalizeRoleKey(role);
  if (norm === 'admin') return 'ADMIN';
  const match = getPricingRoles(pricingPlans).find((p) => p.role === norm);
  return (match?.label || norm).toUpperCase();
}

export function checkEndpointAccess(
  endpointId: string,
  content: Pick<SiteContent, 'privateEndpointIds' | 'privateEndpointRoles'> &
    Partial<Pick<SiteContent, 'pricingPlans'>>,
  userRole?: UserRole | null
): {
  isPrivate: boolean;
  allowedRoles: UserRole[];
  hasAccess: boolean;
} {
  const isPrivate = Array.isArray(content.privateEndpointIds)
    ? content.privateEndpointIds.includes(endpointId)
    : false;

  const pricingRoles = getPricingRoles(content.pricingPlans).map((p) => p.role);

  if (!isPrivate) {
    return {
      isPrivate: false,
      allowedRoles: [...pricingRoles, 'admin'],
      hasAccess: true,
    };
  }

  const hasConfiguredEntry = Boolean(
    content.privateEndpointRoles &&
      Object.prototype.hasOwnProperty.call(content.privateEndpointRoles, endpointId) &&
      Array.isArray(content.privateEndpointRoles[endpointId])
  );

  const allowedRoles: UserRole[] = hasConfiguredEntry
    ? Array.from(
        new Set(
          (content.privateEndpointRoles[endpointId] || [])
            .map((r) => normalizeRoleKey(String(r)))
            .filter((r) => r.length > 0 && r !== 'admin')
        )
      )
    : getDefaultPrivateRoles(content.pricingPlans);

  const normalizedUserRole = userRole ? normalizeRoleKey(String(userRole)) : '';
  const isAdminUser = normalizedUserRole === 'admin';
  const hasAccess = isAdminUser || Boolean(normalizedUserRole && allowedRoles.includes(normalizedUserRole));

  return {
    isPrivate: true,
    allowedRoles,
    hasAccess,
  };
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
} from 'lucide-react';
import { API_ENDPOINTS, CATEGORY_LABELS } from '../data/apiCatalog';
import { auth } from '../lib/firebase';
import { PageRoute, UsageLogItem } from '../types/app';

export interface ServerEndpointLatencyMetric {
  endpointPath: string;
  method: string;
  category: string;
  totalRequests: number;
  errorCount: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  lastLatencyMs: number;
  lastStatus: number;
  lastUpdatedAt: string;
  recentSamples: number[];
}

interface MergedEndpointLatency extends ServerEndpointLatencyMetric {
  endpointId: string;
  title: string;
  source: 'live-server' | 'riwayat-tersimpan';
}

interface LatencyMonitorPanelProps {
  historicalLogs: UsageLogItem[];
  onNavigate: (route: PageRoute) => void;
}

type CategoryFilter = 'all' | 'integrasi' | 'spotify' | 'cuaca' | 'kurs';
type SortMode = 'avg-desc' | 'avg-asc' | 'req-desc';
type ChartOrientation = 'horizontal' | 'vertical';

function getLatencyTier(avgMs: number): {
  label: string;
  barColor: string;
  textClass: string;
  badgeClass: string;
} {
  if (avgMs <= 400) {
    return {
      label: 'Cepat',
      barColor: '#16A34A',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      badgeClass:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (avgMs <= 1200) {
    return {
      label: 'Sedang',
      barColor: '#D97706',
      textClass: 'text-amber-700 dark:text-amber-400',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }
  return {
    label: 'Lambat',
    barColor: '#DC2626',
    textClass: 'text-rose-700 dark:text-rose-400',
    badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  };
}

function formatShortTime(isoOrSeconds: string | number | null | undefined): string {
  if (!isoOrSeconds) return '-';
  const d =
    typeof isoOrSeconds === 'number'
      ? new Date(isoOrSeconds * 1000)
      : new Date(isoOrSeconds);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortenPathLabel(path: string): string {
  return path.replace(/^\/api\/v1\//, '');
}

export function LatencyMonitorPanel({
  historicalLogs,
  onNavigate,
}: LatencyMonitorPanelProps) {
  const [serverMetrics, setServerMetrics] = useState<ServerEndpointLatencyMetric[]>([]);
  const [serverTime, setServerTime] = useState<string>('');
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>('');
  const [isLive, setIsLive] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('avg-desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orientation, setOrientation] = useState<ChartOrientation>('horizontal');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState<boolean>(false);

  const catalogByPath = useMemo(() => {
    const map = new Map<string, (typeof API_ENDPOINTS)[number]>();
    for (const ep of API_ENDPOINTS) {
      map.set(`${ep.method}:${ep.path}`, ep);
      if (!map.has(ep.path)) map.set(ep.path, ep);
    }
    return map;
  }, []);

  const fetchLatencySnapshot = useCallback(async (showSpinner = false) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    if (showSpinner) setRefreshing(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/internal/admin/latency', {
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        sukses: boolean;
        serverTime?: string;
        uptimeSeconds?: number;
        endpoints?: ServerEndpointLatencyMetric[];
      };
      if (data.sukses && Array.isArray(data.endpoints)) {
        setServerMetrics(data.endpoints);
        setServerTime(data.serverTime || new Date().toISOString());
        setUptimeSeconds(data.uptimeSeconds || 0);
        setFetchError('');
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? `Gagal memuat telemetri: ${err.message}` : 'Gagal memuat telemetri.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchLatencySnapshot(false);
  }, [fetchLatencySnapshot]);

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      void fetchLatencySnapshot(false);
    }, 2500);
    return () => clearInterval(timer);
  }, [isLive, fetchLatencySnapshot]);

  const handleResetServerTelemetry = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setResetting(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/internal/admin/latency/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        setServerMetrics([]);
        setSelectedKey(null);
        await fetchLatencySnapshot(true);
      }
    } finally {
      setResetting(false);
    }
  };

  // Merge live server metrics with historical Firestore logs for endpoints not yet called since boot
  const mergedMetrics: MergedEndpointLatency[] = useMemo(() => {
    const byKey = new Map<string, MergedEndpointLatency>();

    for (const sm of serverMetrics) {
      const spec =
        catalogByPath.get(`${sm.method}:${sm.endpointPath}`) ??
        catalogByPath.get(sm.endpointPath);
      const normalizedCategory =
        spec?.category ?? (sm.category === 'mata-uang' ? 'kurs' : sm.category);
      const key = `${sm.method} ${sm.endpointPath}`;
      byKey.set(key, {
        ...sm,
        category: normalizedCategory,
        endpointId: spec?.id || shortenPathLabel(sm.endpointPath),
        title: spec?.title || shortenPathLabel(sm.endpointPath),
        source: 'live-server',
      });
    }

    // Aggregate historical Firestore logs strictly for endpoints not already present in live-server
    const histBuckets = new Map<
      string,
      {
        method: string;
        path: string;
        endpointId: string;
        samples: number[];
        errorCount: number;
        lastStatus: number;
        lastUpdatedSec: number;
      }
    >();

    for (const log of historicalLogs) {
      const key = `${log.method} ${log.path}`;
      if (byKey.has(key)) continue;
      const existing = histBuckets.get(key);
      const sec = log.createdAt?.seconds ?? 0;
      if (!existing) {
        histBuckets.set(key, {
          method: log.method,
          path: log.path,
          endpointId: log.endpointId,
          samples: [log.latencyMs],
          errorCount: log.status >= 400 ? 1 : 0,
          lastStatus: log.status,
          lastUpdatedSec: sec,
        });
      } else {
        existing.samples.push(log.latencyMs);
        if (log.status >= 400) existing.errorCount += 1;
        if (sec >= existing.lastUpdatedSec) {
          existing.lastUpdatedSec = sec;
          existing.lastStatus = log.status;
        }
      }
    }

    for (const [key, b] of histBuckets.entries()) {
      const spec =
        catalogByPath.get(`${b.method}:${b.path}`) ?? catalogByPath.get(b.path);
      const sum = b.samples.reduce((acc, v) => acc + v, 0);
      const avg = Math.round((sum / Math.max(1, b.samples.length)) * 10) / 10;
      const min = Math.min(...b.samples);
      const max = Math.max(...b.samples);
      byKey.set(key, {
        endpointPath: b.path,
        method: b.method,
        category: spec?.category ?? 'integrasi',
        totalRequests: b.samples.length,
        errorCount: b.errorCount,
        avgLatencyMs: avg,
        minLatencyMs: min,
        maxLatencyMs: max,
        lastLatencyMs: b.samples[0] ?? avg,
        lastStatus: b.lastStatus,
        lastUpdatedAt: b.lastUpdatedSec ? new Date(b.lastUpdatedSec * 1000).toISOString() : '',
        recentSamples: b.samples.slice(0, 20),
        endpointId: spec?.id || b.endpointId,
        title: spec?.title || shortenPathLabel(b.path),
        source: 'riwayat-tersimpan',
      });
    }

    return Array.from(byKey.values());
  }, [serverMetrics, historicalLogs, catalogByPath]);

  const filteredMetrics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = mergedMetrics.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.endpointPath.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortMode === 'avg-asc') return a.avgLatencyMs - b.avgLatencyMs;
      if (sortMode === 'req-desc') return b.totalRequests - a.totalRequests;
      return b.avgLatencyMs - a.avgLatencyMs;
    });

    return list;
  }, [mergedMetrics, categoryFilter, searchQuery, sortMode]);

  const summary = useMemo(() => {
    if (filteredMetrics.length === 0) {
      return {
        endpointCount: 0,
        totalRequests: 0,
        weightedAvgMs: 0,
        slowestEndpoint: null as MergedEndpointLatency | null,
        errorRatePct: 0,
      };
    }
    let totalReq = 0;
    let totalErr = 0;
    let weightedSum = 0;
    let slowest = filteredMetrics[0];

    for (const m of filteredMetrics) {
      totalReq += m.totalRequests;
      totalErr += m.errorCount;
      weightedSum += m.avgLatencyMs * m.totalRequests;
      if (m.avgLatencyMs > slowest.avgLatencyMs) {
        slowest = m;
      }
    }

    return {
      endpointCount: filteredMetrics.length,
      totalRequests: totalReq,
      weightedAvgMs: Math.round((weightedSum / Math.max(1, totalReq)) * 10) / 10,
      slowestEndpoint: slowest,
      errorRatePct:
        totalReq > 0 ? Math.round((totalErr / totalReq) * 1000) / 10 : 0,
    };
  }, [filteredMetrics]);

  const maxChartMs = useMemo(() => {
    const rawMax = filteredMetrics.reduce((acc, m) => Math.max(acc, m.avgLatencyMs), 0);
    if (rawMax <= 100) return 100;
    if (rawMax <= 500) return Math.ceil(rawMax / 100) * 100;
    return Math.ceil(rawMax / 250) * 250;
  }, [filteredMetrics]);

  const selectedItem = useMemo(() => {
    if (!selectedKey) return filteredMetrics[0] ?? null;
    return (
      filteredMetrics.find((m) => `${m.method} ${m.endpointPath}` === selectedKey) ??
      filteredMetrics[0] ??
      null
    );
  }, [filteredMetrics, selectedKey]);

  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxChartMs * ratio));

  return (
    <div className="mt-6 space-y-6">
      {/* Top Status & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#111111]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium dark:border-white/10 dark:bg-[#0A0A0A]">
            <span
              className={`h-2 w-2 rounded-full ${
                isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className="text-slate-800 dark:text-slate-200">
              {isLive ? 'Pemantauan Live (2,5 dtk)' : 'Pemantauan Dijeda'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Pembaruan: {serverTime ? formatShortTime(serverTime) : '--:--:--'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <Server className="h-3.5 w-3.5 shrink-0" />
            <span>Uptime: {uptimeSeconds} dtk</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLive((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 whitespace-nowrap cursor-pointer"
          >
            {isLive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isLive ? 'Jeda Live' : 'Lanjutkan Live'}</span>
          </button>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => void fetchLatencySnapshot(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            disabled={resetting}
            onClick={() => void handleResetServerTelemetry()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Metrik Live</span>
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {fetchError}
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Endpoint Terpantau
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.endpointCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Dari {API_ENDPOINTS.length} endpoint terdaftar
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Rata-Rata Latensi Global
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.weightedAvgMs} <span className="text-sm font-normal text-slate-500">ms</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Rata-rata tertimbang per permintaan
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Endpoint Terlambat (Bottleneck)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.slowestEndpoint ? `${summary.slowestEndpoint.avgLatencyMs} ms` : '-'}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {summary.slowestEndpoint
              ? shortenPathLabel(summary.slowestEndpoint.endpointPath)
              : 'Belum ada data'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Permintaan &amp; Error
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.totalRequests}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Rasio error: {summary.errorRatePct}%
          </div>
        </div>
      </div>

      {/* Filters & Chart Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111111] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-sky-500" />
              <span>Rata-Rata Latensi per Endpoint (ms)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Visualisasi performa respons API pihak ketiga dan scraper secara real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Threshold Legend */}
            <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 mr-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#16A34A]" />
                <span>&le;400ms</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#D97706]" />
                <span>401-1200ms</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#DC2626]" />
                <span>&gt;1200ms</span>
              </span>
            </div>

            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-[#0A0A0A]">
              <button
                type="button"
                onClick={() => setOrientation('horizontal')}
                className={`rounded-md px-2.5 py-1 cursor-pointer ${
                  orientation === 'horizontal'
                    ? 'bg-white text-slate-900 font-medium shadow-2xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Horizontal
              </button>
              <button
                type="button"
                onClick={() => setOrientation('vertical')}
                className={`rounded-md px-2.5 py-1 cursor-pointer ${
                  orientation === 'vertical'
                    ? 'bg-white text-slate-900 font-medium shadow-2xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Vertikal
              </button>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Semua Kategori' },
                { id: 'integrasi', label: CATEGORY_LABELS.integrasi },
                { id: 'spotify', label: CATEGORY_LABELS.spotify },
                { id: 'cuaca', label: CATEGORY_LABELS.cuaca },
                { id: 'kurs', label: CATEGORY_LABELS.kurs },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter endpoint..."
                className="w-48 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
              />
            </div>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Urutkan endpoint"
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
            >
              <option value="avg-desc">Urut: Latensi Tertinggi</option>
              <option value="avg-asc">Urut: Latensi Tercepat</option>
              <option value="req-desc">Urut: Permintaan Terbanyak</option>
            </select>
          </div>
        </div>

        {/* Chart Area: Loading / Empty / Populated */}
        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-44 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div
                  className="h-6 rounded bg-slate-200 dark:bg-white/10 animate-pulse"
                  style={{ width: `${Math.max(20, 80 - i * 11)}%` }}
                />
              </div>
            ))}
          </div>
        ) : filteredMetrics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-white/15 dark:bg-[#0A0A0A]">
            <Activity className="mx-auto h-7 w-7 text-slate-400" />
            <h3 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
              {mergedMetrics.length === 0
                ? 'Belum Ada Permintaan API yang Tercatat'
                : 'Tidak Ada Endpoint yang Cocok dengan Filter'}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
              {mergedMetrics.length === 0
                ? 'Jalankan permintaan melalui Playground atau cURL ke salah satu endpoint untuk melihat metrik rata-rata latensi secara real-time.'
                : 'Ubah kategori atau kata kunci filter di atas untuk menampilkan endpoint yang tersedia.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {mergedMetrics.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setSearchQuery('');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 cursor-pointer"
                >
                  Reset Filter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate({ page: 'docs', endpointId: 'spotify-play' })}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  Uji Endpoint di Playground
                </button>
              )}
            </div>
          </div>
        ) : orientation === 'horizontal' ? (
          /* HORIZONTAL BAR CHART */
          <div className="space-y-3">
            {/* Scale Header */}
            <div className="hidden sm:grid sm:grid-cols-12 items-center gap-3 text-[10px] font-mono tabular-nums text-slate-400">
              <div className="sm:col-span-4">ENDPOINT</div>
              <div className="sm:col-span-6 flex justify-between border-b border-slate-200 pb-1 dark:border-white/10">
                {axisTicks.map((t) => (
                  <span key={t}>{t} ms</span>
                ))}
              </div>
              <div className="sm:col-span-2 text-right">RATA-RATA</div>
            </div>

            <div className="space-y-2">
              {filteredMetrics.map((m) => {
                const key = `${m.method} ${m.endpointPath}`;
                const tier = getLatencyTier(m.avgLatencyMs);
                const pct = Math.min(100, Math.max(2, (m.avgLatencyMs / maxChartMs) * 100));
                const isSelected =
                  selectedItem && `${selectedItem.method} ${selectedItem.endpointPath}` === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full grid grid-cols-1 sm:grid-cols-12 items-center gap-2 sm:gap-3 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-sky-500/60 bg-sky-500/[0.06]'
                        : 'border-slate-200/80 bg-slate-50/50 hover:border-slate-300 dark:border-white/10 dark:bg-[#0A0A0A] dark:hover:border-white/20'
                    }`}
                  >
                    <div className="sm:col-span-4 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 shrink-0">
                          {m.method}
                        </span>
                        <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {shortenPathLabel(m.endpointPath)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {m.title}
                      </div>
                    </div>

                    <div className="sm:col-span-6">
                      <div className="relative h-6 w-full overflow-hidden rounded-md bg-slate-200/70 dark:bg-white/[0.06]">
                        {/* Subtle quarter gridlines */}
                        <div className="pointer-events-none absolute inset-0 flex justify-between px-[25%]">
                          <span className="h-full w-px bg-slate-300/60 dark:bg-white/10" />
                          <span className="h-full w-px bg-slate-300/60 dark:bg-white/10" />
                        </div>
                        <div
                          className="h-full rounded-md transition-all duration-300 ease-out"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: tier.barColor,
                          }}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 font-mono tabular-nums">
                      <span className={`text-xs font-bold ${tier.textClass}`}>
                        {m.avgLatencyMs} ms
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        ({m.totalRequests}x)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* VERTICAL COLUMN BAR CHART (SVG) */
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[640px]">
              <svg
                viewBox={`0 0 ${Math.max(680, filteredMetrics.length * 74 + 70)} 270`}
                className="w-full h-64"
                role="img"
                aria-label="Grafik vertikal rata-rata latensi endpoint"
              >
                {/* Horizontal gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = 200 - ratio * 170;
                  const tickVal = Math.round(maxChartMs * ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1="54"
                        y1={y}
                        x2={Math.max(660, filteredMetrics.length * 74 + 54)}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity={0.12}
                        strokeDasharray={ratio === 0 ? undefined : '3 3'}
                      />
                      <text
                        x="48"
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {filteredMetrics.map((m, idx) => {
                  const key = `${m.method} ${m.endpointPath}`;
                  const tier = getLatencyTier(m.avgLatencyMs);
                  const barH = Math.max(4, Math.min(170, (m.avgLatencyMs / maxChartMs) * 170));
                  const x = 68 + idx * 74;
                  const y = 200 - barH;
                  const shortName = shortenPathLabel(m.endpointPath).split('/').pop() || m.endpointPath;
                  const isSelected =
                    selectedItem && `${selectedItem.method} ${selectedItem.endpointPath}` === key;

                  return (
                    <g
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      className="cursor-pointer"
                    >
                      {isSelected && (
                        <rect
                          x={x - 6}
                          y={20}
                          width={52}
                          height={186}
                          rx={6}
                          fill="currentColor"
                          fillOpacity={0.06}
                        />
                      )}
                      <rect
                        x={x}
                        y={y}
                        width={40}
                        height={barH}
                        rx={5}
                        fill={tier.barColor}
                        fillOpacity={isSelected ? 1 : 0.85}
                      />
                      <text
                        x={x + 20}
                        y={Math.max(16, y - 6)}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[10px] font-mono font-semibold"
                      >
                        {Math.round(m.avgLatencyMs)}ms
                      </text>
                      <text
                        x={x + 20}
                        y={218}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                      >
                        {shortName.slice(0, 10)}
                      </text>
                      <text
                        x={x + 20}
                        y={232}
                        textAnchor="middle"
                        className="fill-slate-400 text-[9px] font-mono"
                      >
                        {m.totalRequests}x
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        {/* Selected Endpoint Inspection Strip */}
        {selectedItem && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#0A0A0A]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {selectedItem.method} {selectedItem.endpointPath}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      getLatencyTier(selectedItem.avgLatencyMs).badgeClass
                    }`}
                  >
                    {getLatencyTier(selectedItem.avgLatencyMs).label}
                  </span>
                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    {selectedItem.source === 'live-server' ? 'Telemetri Live Server' : 'Riwayat Tersimpan'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedItem.title} / Update terakhir: {formatShortTime(selectedItem.lastUpdatedAt)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
                <div>
                  <span className="text-slate-500">Avg: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {selectedItem.avgLatencyMs} ms
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Min: </span>
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {selectedItem.minLatencyMs} ms
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Max: </span>
                  <strong className="text-amber-600 dark:text-amber-400">
                    {selectedItem.maxLatencyMs} ms
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Terakhir: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {selectedItem.lastLatencyMs} ms (HTTP {selectedItem.lastStatus})
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* High-Density Tabular Breakdown */}
      {filteredMetrics.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111111]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Endpoint</th>
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 font-medium text-right">Rata-Rata</th>
                <th className="px-4 py-2.5 font-medium text-right">Min / Max</th>
                <th className="px-4 py-2.5 font-medium text-right">Permintaan</th>
                <th className="px-4 py-2.5 font-medium text-right">Error</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {filteredMetrics.map((m) => {
                const tier = getLatencyTier(m.avgLatencyMs);
                return (
                  <tr
                    key={`${m.method}-${m.endpointPath}`}
                    onClick={() => setSelectedKey(`${m.method} ${m.endpointPath}`)}
                    className="h-10 hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono">
                      <span className="mr-2 font-semibold text-sky-600 dark:text-sky-400">
                        {m.method}
                      </span>
                      <span className="text-slate-900 dark:text-white">{m.endpointPath}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                      {CATEGORY_LABELS[m.category as keyof typeof CATEGORY_LABELS] || m.category}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${tier.textClass}`}>
                      {m.avgLatencyMs} ms
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {m.minLatencyMs} / {m.maxLatencyMs} ms
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                      {m.totalRequests}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {m.errorCount}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${tier.badgeClass}`}>
                        {tier.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

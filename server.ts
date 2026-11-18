import express, { type Request, type Response, type NextFunction } from 'express';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

const execFileAsync = promisify(execFile);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PROD = process.env.NODE_ENV === 'production';

function resolveListenPort(): number {
  const portArgIdx = process.argv.findIndex((arg) => arg === '--port' || arg.startsWith('--port='));
  if (portArgIdx !== -1) {
    const arg = process.argv[portArgIdx];
    const raw = arg.includes('=') ? arg.split('=')[1] : process.argv[portArgIdx + 1];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (!IS_PROD && envPort && nginxPort && envPort === nginxPort) {
    return Number(process.env.DEFAULT_APP_PORT) || 3000;
  }
  return envPort || 3000;
}

const PORT = resolveListenPort();

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(firebaseConfigPath, 'utf-8')
);

const ADMIN_EMAIL = 'predimahrobi@gmail.com';

interface CachedSession {
  uid: string;
  email: string;
  role: string;
  apiKey: string;
  dailyLimit: number;
  creditsUsedToday: number;
  creditsResetDate: string;
  roleExpiresAt: number; // 0 = permanent, >0 = epoch ms
  suspended?: boolean;
  suspendedReason?: string;
  idToken?: string;
}

// Runtime session registry for standalone x-efemma-key calls (e.g., via cURL)
const apiKeyRegistry = new Map<string, CachedSession>();

const PATH_TO_ENDPOINT_ID: Record<string, string> = {
  '/cuaca/sekarang': 'cuaca-sekarang',
  '/cuaca/prakiraan': 'cuaca-prakiraan',
  '/kurs/konversi': 'kurs-konversi',
  '/kurs/daftar': 'kurs-daftar',
  '/integrasi/ip-lookup': 'integrasi-ip-lookup',
  '/integrasi/meta-url': 'integrasi-meta-url',
  '/integrasi/webhook-sign': 'integrasi-webhook-sign',
  '/spotify/trending': 'spotify-trending',
  '/spotify/popular': 'spotify-popular',
  '/spotify/new-releases': 'spotify-new-releases',
  '/spotify/genres': 'spotify-genres',
  '/spotify/artists': 'spotify-artists',
  '/spotify/albums': 'spotify-albums',
  '/spotify/playlists': 'spotify-playlists',
  '/spotify/mood-activities': 'spotify-mood-activities',
  '/spotify/podcasts': 'spotify-podcasts',
  '/spotify/search': 'spotify-search',
  '/spotify/library': 'spotify-library',
  '/spotify/play': 'spotify-play',
  '/spotify/podcast-play': 'spotify-podcast-play',
  '/spotify/lirik': 'spotify-lirik',
};

function normalizeServerRoleKey(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 40);
  return slug || 'free';
}

interface SiteAccessRulesCache {
  privateEndpointIds: Set<string>;
  privateEndpointRoles: Map<string, Set<string>>;
  defaultPrivateRoles: Set<string>;
  fetchedAt: number;
}

let siteAccessCache: SiteAccessRulesCache = {
  privateEndpointIds: new Set(),
  privateEndpointRoles: new Map(),
  defaultPrivateRoles: new Set(['pro', 'enterprise']),
  fetchedAt: 0,
};

async function getSiteAccessRules(forceRefresh = false): Promise<SiteAccessRulesCache> {
  const now = Date.now();
  if (!forceRefresh && siteAccessCache.fetchedAt > 0 && now - siteAccessCache.fetchedAt < 10_000) {
    return siteAccessCache;
  }
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/siteContent/main`;
  try {
    const res = await fetch(url);
    if (!res.ok) return siteAccessCache;
    const doc = (await res.json()) as {
      fields?: {
        pricingPlans?: {
          arrayValue?: {
            values?: Array<{
              mapValue?: {
                fields?: {
                  id?: { stringValue?: string };
                  name?: { stringValue?: string };
                };
              };
            }>;
          };
        };
        privateEndpointIds?: {
          arrayValue?: { values?: Array<{ stringValue?: string }> };
        };
        privateEndpointRoles?: {
          mapValue?: {
            fields?: Record<
              string,
              { arrayValue?: { values?: Array<{ stringValue?: string }> } }
            >;
          };
        };
      };
    };

    const nextIds = new Set<string>();
    const rawIds = doc.fields?.privateEndpointIds?.arrayValue?.values ?? [];
    for (const v of rawIds) {
      if (v.stringValue) nextIds.add(v.stringValue);
    }

    const nextDefaultRoles = new Set<string>();
    const rawPlans = doc.fields?.pricingPlans?.arrayValue?.values ?? [];
    for (const p of rawPlans) {
      const pf = p.mapValue?.fields;
      if (!pf) continue;
      const roleKey = normalizeServerRoleKey(pf.id?.stringValue || pf.name?.stringValue || '');
      if (roleKey && roleKey !== 'free' && roleKey !== 'admin') {
        nextDefaultRoles.add(roleKey);
      }
    }
    if (nextDefaultRoles.size === 0) {
      nextDefaultRoles.add('pro');
      nextDefaultRoles.add('enterprise');
    }

    const nextRoles = new Map<string, Set<string>>();
    const rawRolesMap = doc.fields?.privateEndpointRoles?.mapValue?.fields ?? {};
    for (const [epId, val] of Object.entries(rawRolesMap)) {
      if (!val.arrayValue) continue;
      const vals = val.arrayValue.values ?? [];
      const set = new Set<string>();
      for (const item of vals) {
        if (typeof item.stringValue === 'string' && item.stringValue.trim().length > 0) {
          const normalized = normalizeServerRoleKey(item.stringValue);
          if (normalized && normalized !== 'admin') {
            set.add(normalized);
          }
        }
      }
      // Always record explicit entry even when empty (Admin-only Private endpoint)
      nextRoles.set(epId, set);
    }

    siteAccessCache = {
      privateEndpointIds: nextIds,
      privateEndpointRoles: nextRoles,
      defaultPrivateRoles: nextDefaultRoles,
      fetchedAt: now,
    };
  } catch {
    // Retain previous cache if transient error
  }
  return siteAccessCache;
}

function getJakartaDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ uid: string; email: string; emailVerified: boolean } | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: (user.email || '').toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

interface FirestoreUserFields {
  email: string;
  role: string;
  apiKey: string;
  creditsUsedToday: number;
  creditsResetDate: string;
  dailyLimit: number;
  roleExpiresAt: number;
  suspended: boolean;
  suspendedReason: string;
}

async function fetchUserFromFirestore(
  uid: string,
  idToken: string
): Promise<FirestoreUserFields | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${encodeURIComponent(
    uid
  )}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      fields?: Record<
        string,
        { stringValue?: string; integerValue?: string; booleanValue?: boolean }
      >;
    };
    const f = doc.fields;
    if (!f) return null;
    const role = normalizeServerRoleKey(f.role?.stringValue || 'free');
    const rawExpires = Number(f.roleExpiresAt?.integerValue ?? '0');
    const fallbackLimit =
      role === 'admin' || role === 'enterprise' ? -1 : role === 'pro' ? 5000 : 10;
    const parsedLimit = Number(f.dailyLimit?.integerValue ?? String(fallbackLimit));
    const dailyLimit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : fallbackLimit;
    return {
      email: (f.email?.stringValue ?? '').toLowerCase(),
      role,
      apiKey: f.apiKey?.stringValue ?? '',
      creditsUsedToday: Number(f.creditsUsedToday?.integerValue ?? '0'),
      creditsResetDate: f.creditsResetDate?.stringValue ?? getJakartaDateString(),
      dailyLimit,
      roleExpiresAt: Number.isFinite(rawExpires) && rawExpires > 0 ? rawExpires : 0,
      suspended: Boolean(f.suspended?.booleanValue),
      suspendedReason: f.suspendedReason?.stringValue ?? '',
    };
  } catch {
    return null;
  }
}

async function resetExpiredRoleInFirestore(uid: string, idToken: string): Promise<boolean> {
  const docPath = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${uid}`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:commit`;
  try {
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docPath,
              fields: {
                role: { stringValue: 'free' },
                dailyLimit: { integerValue: '10' },
                roleExpiresAt: { integerValue: '0' },
              },
            },
            updateMask: {
              fieldPaths: ['role', 'dailyLimit', 'roleExpiresAt'],
            },
            updateTransforms: [
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function enforceRoleExpirationOnSession(session: CachedSession): Promise<boolean> {
  if (
    session.email.toLowerCase() === ADMIN_EMAIL ||
    session.role === 'free' ||
    !session.roleExpiresAt ||
    session.roleExpiresAt <= 0
  ) {
    return false;
  }
  if (Date.now() < session.roleExpiresAt) {
    return false;
  }
  // Auto-reset role back to Free WITHOUT altering session.apiKey
  session.role = 'free';
  session.dailyLimit = 10;
  session.roleExpiresAt = 0;
  if (session.idToken) {
    await resetExpiredRoleInFirestore(session.uid, session.idToken);
  }
  return true;
}

async function incrementCreditInFirestore(
  uid: string,
  idToken: string,
  nextCreditsUsed: number,
  todayDate: string
): Promise<boolean> {
  const docPath = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${uid}`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:commit`;
  try {
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docPath,
              fields: {
                creditsUsedToday: { integerValue: String(nextCreditsUsed) },
                creditsResetDate: { stringValue: todayDate },
              },
            },
            updateMask: {
              fieldPaths: ['creditsUsedToday', 'creditsResetDate'],
            },
            updateTransforms: [
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Helper: Fetch JSON with clean AbortController timeout
async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'EfemmaAPI/1.0 (+https://efemma.dev)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} dari upstream`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function deskripsiCuacaWmo(kode: number): string {
  const peta: Record<number, string> = {
    0: 'Cerah',
    1: 'Cerah Berawan',
    2: 'Berawan Sebagian',
    3: 'Mendung',
    45: 'Berkabut',
    48: 'Kabut Tebal',
    51: 'Gerimis Ringan',
    53: 'Gerimis Sedang',
    55: 'Gerimis Lebat',
    61: 'Hujan Ringan',
    63: 'Hujan Sedang',
    65: 'Hujan Lebat',
    71: 'Salju Ringan',
    80: 'Hujan Lokal Ringan',
    81: 'Hujan Lokal Sedang',
    82: 'Hujan Lokal Deras',
    95: 'Badai Petir',
    96: 'Badai Petir & Hujan Es',
    99: 'Badai Petir Kuat',
  };
  return peta[kode] ?? 'Berawan';
}

interface FallbackCity {
  nama: string;
  negara: string;
  kode_negara: string;
  lintang: number;
  bujur: number;
  zona_waktu: string;
  suhu_c: number;
  kelembapan: number;
  angin_kmj: number;
  kode_wmo: number;
}

const FALLBACK_CITIES: Record<string, FallbackCity> = {
  jakarta: {
    nama: 'Jakarta',
    negara: 'Indonesia',
    kode_negara: 'ID',
    lintang: -6.2088,
    bujur: 106.8456,
    zona_waktu: 'Asia/Jakarta',
    suhu_c: 30.4,
    kelembapan: 72,
    angin_kmj: 12.6,
    kode_wmo: 2,
  },
  bandung: {
    nama: 'Bandung',
    negara: 'Indonesia',
    kode_negara: 'ID',
    lintang: -6.9175,
    bujur: 107.6191,
    zona_waktu: 'Asia/Jakarta',
    suhu_c: 23.8,
    kelembapan: 79,
    angin_kmj: 9.4,
    kode_wmo: 61,
  },
  surabaya: {
    nama: 'Surabaya',
    negara: 'Indonesia',
    kode_negara: 'ID',
    lintang: -7.2575,
    bujur: 112.7521,
    zona_waktu: 'Asia/Jakarta',
    suhu_c: 32.1,
    kelembapan: 66,
    angin_kmj: 15.2,
    kode_wmo: 1,
  },
  yogyakarta: {
    nama: 'Yogyakarta',
    negara: 'Indonesia',
    kode_negara: 'ID',
    lintang: -7.7956,
    bujur: 110.3695,
    zona_waktu: 'Asia/Jakarta',
    suhu_c: 28.5,
    kelembapan: 74,
    angin_kmj: 11.0,
    kode_wmo: 2,
  },
  denpasar: {
    nama: 'Denpasar',
    negara: 'Indonesia',
    kode_negara: 'ID',
    lintang: -8.6705,
    bujur: 115.2126,
    zona_waktu: 'Asia/Makassar',
    suhu_c: 29.7,
    kelembapan: 75,
    angin_kmj: 16.5,
    kode_wmo: 1,
  },
  singapore: {
    nama: 'Singapore',
    negara: 'Singapore',
    kode_negara: 'SG',
    lintang: 1.3521,
    bujur: 103.8198,
    zona_waktu: 'Asia/Singapore',
    suhu_c: 29.2,
    kelembapan: 78,
    angin_kmj: 13.8,
    kode_wmo: 2,
  },
  tokyo: {
    nama: 'Tokyo',
    negara: 'Japan',
    kode_negara: 'JP',
    lintang: 35.6762,
    bujur: 139.6503,
    zona_waktu: 'Asia/Tokyo',
    suhu_c: 16.4,
    kelembapan: 58,
    angin_kmj: 14.1,
    kode_wmo: 0,
  },
};

const BASE_USD_RATES: Record<string, number> = {
  USD: 1,
  IDR: 15850,
  EUR: 0.924,
  SGD: 1.342,
  MYR: 4.465,
  JPY: 154.2,
  GBP: 0.788,
  AUD: 1.536,
  CNY: 7.235,
  SAR: 3.75,
  KRW: 1398.5,
};

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function isValidIp(ip: string): boolean {
  const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6 = /^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

async function resolveCityCoordinates(kota: string) {
  const key = kota.trim().toLowerCase();
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      kota.trim()
    )}&count=1&language=id&format=json`;
    const geoData = await fetchJsonWithTimeout<{
      results?: Array<{
        name: string;
        country?: string;
        country_code?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }>;
    }>(geoUrl, 4000);

    if (geoData.results && geoData.results.length > 0) {
      const top = geoData.results[0];
      return {
        nama: top.name,
        negara: top.country ?? 'Tidak diketahui',
        kode_negara: top.country_code ?? '-',
        lintang: top.latitude,
        bujur: top.longitude,
        zona_waktu: top.timezone ?? 'UTC',
      };
    }
  } catch {
    // Fallback below
  }

  const fb = FALLBACK_CITIES[key];
  if (fb) {
    return {
      nama: fb.nama,
      negara: fb.negara,
      kode_negara: fb.kode_negara,
      lintang: fb.lintang,
      bujur: fb.bujur,
      zona_waktu: fb.zona_waktu,
    };
  }
  return null;
}

async function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  const AUDIO_CACHE_DIR = path.join(os.tmpdir(), 'efemma_audio_cache');
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
  const AUDIO_STREAM_SECRET = crypto
    .createHash('sha256')
    .update(`${firebaseConfig.projectId}:${firebaseConfig.apiKey}:efemma-audio-v1`)
    .digest('hex');

  interface EndpointLatencyBucket {
    endpointPath: string;
    method: string;
    category: string;
    totalRequests: number;
    errorCount: number;
    totalLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    lastLatencyMs: number;
    lastStatus: number;
    lastUpdatedAt: string;
    recentSamples: number[];
  }

  const endpointLatencyStore = new Map<string, EndpointLatencyBucket>();

  function inferCategoryFromApiPath(apiPath: string): string {
    const clean = apiPath.replace(/^\/api\/v1\//, '');
    const seg = clean.split('/')[0] || 'lainnya';
    if (seg === 'cuaca') return 'cuaca';
    if (seg === 'kurs') return 'kurs';
    if (seg === 'integrasi') return 'integrasi';
    if (seg === 'spotify') return 'spotify';
    return seg;
  }

  function recordEndpointLatency(
    method: string,
    endpointPath: string,
    status: number,
    latencyMs: number
  ) {
    const safeLatency = Math.max(0, Math.round(latencyMs * 10) / 10);
    const key = `${method.toUpperCase()} ${endpointPath}`;
    const existing = endpointLatencyStore.get(key);
    const isErr = status >= 400;
    const nowIso = new Date().toISOString();

    if (!existing) {
      endpointLatencyStore.set(key, {
        endpointPath,
        method: method.toUpperCase(),
        category: inferCategoryFromApiPath(endpointPath),
        totalRequests: 1,
        errorCount: isErr ? 1 : 0,
        totalLatencyMs: safeLatency,
        minLatencyMs: safeLatency,
        maxLatencyMs: safeLatency,
        lastLatencyMs: safeLatency,
        lastStatus: status,
        lastUpdatedAt: nowIso,
        recentSamples: [safeLatency],
      });
      return;
    }

    existing.totalRequests += 1;
    if (isErr) existing.errorCount += 1;
    existing.totalLatencyMs += safeLatency;
    existing.minLatencyMs = Math.min(existing.minLatencyMs, safeLatency);
    existing.maxLatencyMs = Math.max(existing.maxLatencyMs, safeLatency);
    existing.lastLatencyMs = safeLatency;
    existing.lastStatus = status;
    existing.lastUpdatedAt = nowIso;
    existing.recentSamples.push(safeLatency);
    if (existing.recentSamples.length > 20) {
      existing.recentSamples.shift();
    }
  }

  function signAudioToken(params: {
    trackId: string;
    q: string;
    dur: string;
    exp: string;
  }): string {
    const payload = `${params.trackId}|${params.q}|${params.dur}|${params.exp}`;
    return crypto.createHmac('sha256', AUDIO_STREAM_SECRET).update(payload).digest('hex');
  }

  function verifyAudioToken(params: {
    trackId: string;
    q: string;
    dur: string;
    exp: string;
    sig: string;
  }): boolean {
    const expNum = Number(params.exp);
    if (!Number.isFinite(expNum) || expNum <= Date.now()) return false;
    const expected = signAudioToken({
      trackId: params.trackId,
      q: params.q,
      dur: params.dur,
      exp: params.exp,
    });
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(params.sig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function buildSignedAudioUrls(
    req: Request,
    trackId: string,
    q: string,
    durasiMs: number,
    endpointPath: '/api/v1/spotify/play' | '/api/v1/spotify/podcast-play' = '/api/v1/spotify/play',
    extraQuery?: Record<string, string>
  ) {
    const exp = String(Date.now() + 3600_000);
    const dur = String(Math.max(0, Math.round(durasiMs || 0)));
    const sig = signAudioToken({ trackId, q, dur, exp });
    const qs = new URLSearchParams({
      ...(endpointPath === '/api/v1/spotify/podcast-play'
        ? { episode_id: trackId }
        : { track_id: trackId }),
      q,
      dur,
      exp,
      sig,
      ...(extraQuery ?? {}),
    });
    const relativeM4a = `${endpointPath}?${qs.toString()}&format=audio`;
    const relativeMp3 = `${endpointPath}?${qs.toString()}&format=mp3`;
    const baseOrigin = `${req.protocol}://${req.get('host')}`;
    return {
      stream_url: `${baseOrigin}${relativeM4a}`,
      mp3_stream_url: `${baseOrigin}${relativeMp3}`,
      relative_stream_url: relativeM4a,
      relative_mp3_stream_url: relativeMp3,
    };
  }

  async function requireAdminRequest(req: Request, res: Response): Promise<boolean> {
    const authHeader = req.header('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ sukses: false, pesan: 'Token autentikasi diperlukan.' });
      return false;
    }
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified) {
      res.status(401).json({ sukses: false, pesan: 'Token sesi tidak valid.' });
      return false;
    }
    if (verified.email === ADMIN_EMAIL && verified.emailVerified) {
      return true;
    }
    const userDoc = await fetchUserFromFirestore(verified.uid, idToken);
    if (userDoc?.role === 'admin') {
      return true;
    }
    res.status(403).json({ sukses: false, pesan: 'Akses khusus Administrator.' });
    return false;
  }

  // Admin real-time latency monitor snapshot
  app.get('/api/internal/admin/latency', async (req: Request, res: Response) => {
    try {
      const ok = await requireAdminRequest(req, res);
      if (!ok) return;

      const endpoints = Array.from(endpointLatencyStore.values())
        .map((item) => ({
          endpointPath: item.endpointPath,
          method: item.method,
          category: item.category,
          totalRequests: item.totalRequests,
          errorCount: item.errorCount,
          avgLatencyMs: Math.round((item.totalLatencyMs / Math.max(1, item.totalRequests)) * 10) / 10,
          minLatencyMs: item.minLatencyMs,
          maxLatencyMs: item.maxLatencyMs,
          lastLatencyMs: item.lastLatencyMs,
          lastStatus: item.lastStatus,
          lastUpdatedAt: item.lastUpdatedAt,
          recentSamples: item.recentSamples,
        }))
        .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);

      return res.json({
        sukses: true,
        serverTime: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        endpoints,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat latensi server.';
      return res.status(502).json({ sukses: false, pesan: msg });
    }
  });

  app.post('/api/internal/admin/latency/reset', async (req: Request, res: Response) => {
    try {
      const ok = await requireAdminRequest(req, res);
      if (!ok) return;
      endpointLatencyStore.clear();
      return res.json({ sukses: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset metrik latensi.';
      return res.status(502).json({ sukses: false, pesan: msg });
    }
  });

  // Sync user session + active API key to server registry so standalone cURL calls also enforce daily credits
  app.post('/api/internal/sync-session', async (req: Request, res: Response) => {
    try {
      const authHeader = req.header('authorization') || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        return res.status(401).json({ sukses: false, pesan: 'Token autentikasi diperlukan.' });
      }
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) {
        return res.status(401).json({ sukses: false, pesan: 'Token sesi tidak valid.' });
      }
      const userDoc = await fetchUserFromFirestore(verified.uid, idToken);
      if (!userDoc || !userDoc.apiKey) {
        return res.status(404).json({ sukses: false, pesan: 'Profil pengguna belum tersedia.' });
      }

      // Remove old keys belonging to same uid so rotated keys immediately become invalid
      for (const [key, session] of apiKeyRegistry.entries()) {
        if (session.uid === verified.uid && key !== userDoc.apiKey) {
          apiKeyRegistry.delete(key);
        }
      }

      const isAdminEmail = verified.email === ADMIN_EMAIL && verified.emailVerified;
      const isExpired =
        !isAdminEmail &&
        userDoc.role !== 'free' &&
        userDoc.roleExpiresAt > 0 &&
        Date.now() >= userDoc.roleExpiresAt;

      const resolvedRole = isAdminEmail
        ? 'admin'
        : isExpired
        ? 'free'
        : userDoc.role;
      const resolvedLimit =
        resolvedRole === 'admin' ? -1 : isExpired ? 10 : userDoc.dailyLimit;
      const resolvedExpiresAt = isAdminEmail || isExpired ? 0 : userDoc.roleExpiresAt;

      if (isExpired) {
        await resetExpiredRoleInFirestore(verified.uid, idToken);
      }

      apiKeyRegistry.set(userDoc.apiKey, {
        uid: verified.uid,
        email: verified.email,
        role: resolvedRole,
        apiKey: userDoc.apiKey,
        dailyLimit: resolvedLimit,
        creditsUsedToday: userDoc.creditsUsedToday,
        creditsResetDate: userDoc.creditsResetDate,
        roleExpiresAt: resolvedExpiresAt,
        suspended: !isAdminEmail && userDoc.suspended,
        suspendedReason: isAdminEmail ? '' : userDoc.suspendedReason,
        idToken,
      });

      return res.json({ sukses: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan sesi.';
      return res.status(502).json({ sukses: false, pesan: msg });
    }
  });

  // Refresh cached siteContent rules immediately when Admin updates Public/Private settings
  app.post('/api/internal/refresh-site-config', async (req: Request, res: Response) => {
    try {
      const authHeader = req.header('authorization') || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        return res.status(401).json({ sukses: false, pesan: 'Token autentikasi diperlukan.' });
      }
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) {
        return res.status(401).json({ sukses: false, pesan: 'Token sesi tidak valid.' });
      }
      const actor = await fetchUserFromFirestore(verified.uid, idToken);
      const isActorAdmin =
        actor?.role === 'admin' || (verified.email === ADMIN_EMAIL && verified.emailVerified);
      if (!isActorAdmin) {
        return res.status(403).json({ sukses: false, pesan: 'Hanya Admin yang dapat menyegarkan aturan.' });
      }
      await getSiteAccessRules(true);
      return res.json({ sukses: true });
    } catch {
      return res.status(500).json({ sukses: false });
    }
  });

  // Immediately synchronize a target user's role & expiration into apiKeyRegistry after Admin update
  app.post('/api/internal/admin-sync-user', async (req: Request, res: Response) => {
    try {
      const authHeader = req.header('authorization') || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        return res.status(401).json({ sukses: false, pesan: 'Token autentikasi diperlukan.' });
      }
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) {
        return res.status(401).json({ sukses: false, pesan: 'Token sesi tidak valid.' });
      }
      const actor = await fetchUserFromFirestore(verified.uid, idToken);
      const isActorAdmin =
        actor?.role === 'admin' || (verified.email === ADMIN_EMAIL && verified.emailVerified);
      if (!isActorAdmin) {
        return res.status(403).json({ sukses: false, pesan: 'Hanya Admin yang dapat menyinkronkan pengguna.' });
      }
      const body = (req.body || {}) as { uid?: string; uids?: unknown; deleted?: boolean };
      const uidListRaw = Array.isArray(body.uids)
        ? body.uids.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      const singleUid = typeof body.uid === 'string' ? body.uid.trim() : '';
      const targetUids = Array.from(
        new Set([...(singleUid ? [singleUid] : []), ...uidListRaw.map((u) => u.trim())])
      ).slice(0, 500);
      if (targetUids.length === 0) {
        return res.status(400).json({ sukses: false, pesan: 'uid atau uids wajib diisi.' });
      }
      await Promise.allSettled(
        targetUids.map(async (targetUid) => {
          const targetDoc = body.deleted
            ? null
            : await fetchUserFromFirestore(targetUid, idToken);
          if (body.deleted || !targetDoc || !targetDoc.apiKey) {
            for (const [key, session] of apiKeyRegistry.entries()) {
              if (session.uid === targetUid) {
                apiKeyRegistry.delete(key);
              }
            }
            return;
          }
          for (const [key, session] of apiKeyRegistry.entries()) {
            if (session.uid === targetUid && key !== targetDoc.apiKey) {
              apiKeyRegistry.delete(key);
            }
          }
          const existing = apiKeyRegistry.get(targetDoc.apiKey);
          const isTargetSuperAdmin =
            (existing?.email || targetDoc.email || '').toLowerCase() === ADMIN_EMAIL;
          apiKeyRegistry.set(targetDoc.apiKey, {
            uid: targetUid,
            email: existing?.email || targetDoc.email || '',
            role: targetDoc.role,
            apiKey: targetDoc.apiKey,
            dailyLimit: targetDoc.dailyLimit,
            creditsUsedToday: targetDoc.creditsUsedToday,
            creditsResetDate: targetDoc.creditsResetDate,
            roleExpiresAt: targetDoc.roleExpiresAt,
            suspended: !isTargetSuperAdmin && targetDoc.suspended,
            suspendedReason: isTargetSuperAdmin ? '' : targetDoc.suspendedReason,
            idToken: existing?.idToken,
          });
        })
      );
      return res.json({ sukses: true, syncedCount: targetUids.length });
    } catch {
      return res.status(500).json({ sukses: false });
    }
  });

  // Helper: Fetch JSON/HTML cleanly with AbortController timeout
  const SCRAPE_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  // Public catalog discovery
  app.get('/api/v1/katalog', (_req: Request, res: Response) => {
    return res.json({
      sukses: true,
      penyedia: 'EfemmaAPI',
      versi: 'v1',
      header_autentikasi: 'x-efemma-key',
      endpoint: [
        { metode: 'GET', jalur: '/api/v1/cuaca/sekarang', kategori: 'cuaca' },
        { metode: 'GET', jalur: '/api/v1/cuaca/prakiraan', kategori: 'cuaca' },
        { metode: 'GET', jalur: '/api/v1/kurs/konversi', kategori: 'mata-uang' },
        { metode: 'GET', jalur: '/api/v1/kurs/daftar', kategori: 'mata-uang' },
        { metode: 'GET', jalur: '/api/v1/integrasi/ip-lookup', kategori: 'integrasi' },
        { metode: 'GET', jalur: '/api/v1/integrasi/meta-url', kategori: 'integrasi' },
        { metode: 'POST', jalur: '/api/v1/integrasi/webhook-sign', kategori: 'integrasi' },
        { metode: 'GET', jalur: '/api/v1/spotify/trending', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/popular', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/new-releases', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/genres', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/artists', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/albums', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/playlists', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/mood-activities', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/podcasts', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/search', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/library', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/play', kategori: 'spotify' },
        { metode: 'POST', jalur: '/api/v1/spotify/play', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/podcast-play', kategori: 'spotify' },
        { metode: 'GET', jalur: '/api/v1/spotify/lirik', kategori: 'spotify' },
      ],
    });
  });

  // Rate-limiting, Latency Telemetry & Auth Enforcement Middleware for /api/v1/*
  app.use('/api/v1', async (req: Request, res: Response, next: NextFunction) => {
    const startHr = process.hrtime.bigint();
    const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;
    const apiKey = (req.header('x-efemma-key') || req.header('x-api-key') || '').trim();
    const authHeader = req.header('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    res.setHeader('X-Powered-By', 'EfemmaAPI');
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');

    const normalizedEndpointPath = `/api/v1${req.path === '/' ? '' : req.path}`;
    const isByteRangeSeek = Boolean(req.headers.range);

    res.on('finish', () => {
      if (isByteRangeSeek) return;
      if (res.statusCode === 401 || res.statusCode === 404) return;
      const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
      recordEndpointLatency(req.method, normalizedEndpointPath, res.statusCode, elapsedMs);
    });

    const requestedFormat = String(req.query.format || '').trim().toLowerCase();
    // Allow signed audio stream URLs issued by /api/v1/spotify/play, /api/v1/spotify/podcast-play, or /api/v1/spotify/lirik
    if (
      req.method === 'GET' &&
      (req.path === '/spotify/play' || req.path === '/spotify/podcast-play') &&
      (requestedFormat === 'audio' || requestedFormat === 'mp3' || requestedFormat === 'm4a') &&
      typeof req.query.sig === 'string' &&
      typeof req.query.exp === 'string'
    ) {
      const signedTargetId = String(
        req.path === '/spotify/podcast-play'
          ? req.query.episode_id || req.query.track_id || ''
          : req.query.track_id || ''
      );
      const validSignedStream = verifyAudioToken({
        trackId: signedTargetId,
        q: String(req.query.q || ''),
        dur: String(req.query.dur || '0'),
        exp: String(req.query.exp || '0'),
        sig: String(req.query.sig || ''),
      });
      if (validSignedStream) {
        res.setHeader('X-Auth-Mode', 'signed-audio-stream');
        return next();
      }
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
      res.setHeader('X-Response-Time-Ms', elapsedMs.toFixed(2));
      return originalJson(body);
    }) as typeof res.json;

    try {
      const today = getJakartaDateString();
      const siteRules = await getSiteAccessRules();
      const endpointId = PATH_TO_ENDPOINT_ID[req.path];
      const isPrivateEndpoint = Boolean(endpointId && siteRules.privateEndpointIds.has(endpointId));
      const allowedPrivateRoles =
        (endpointId ? siteRules.privateEndpointRoles.get(endpointId) : undefined) ??
        siteRules.defaultPrivateRoles;

      // Path A: Browser Playground or authenticated client with Firebase Bearer token
      if (idToken) {
        const verified = await verifyFirebaseIdToken(idToken);
        if (!verified) {
          return res.status(401).json({
            sukses: false,
            kesalahan: {
              kode: 'SESI_TIDAK_VALID',
              pesan: 'Token sesi login tidak valid atau telah kedaluwarsa. Silakan masuk ulang.',
            },
          });
        }

        if (!apiKey) {
          return res.status(401).json({
            sukses: false,
            kesalahan: {
              kode: 'API_KEY_DIPERLUKAN',
              pesan: 'Header x-efemma-key wajib disertakan pada setiap permintaan endpoint.',
            },
          });
        }

        const userDoc = await fetchUserFromFirestore(verified.uid, idToken);
        if (!userDoc) {
          return res.status(401).json({
            sukses: false,
            kesalahan: {
              kode: 'PROFIL_TIDAK_DITEMUKAN',
              pesan: 'Profil akun tidak ditemukan pada sistem.',
            },
          });
        }

        if (apiKey !== userDoc.apiKey) {
          return res.status(401).json({
            sukses: false,
            kesalahan: {
              kode: 'API_KEY_TIDAK_COCOK',
              pesan: 'Header x-efemma-key yang dikirim tidak valid atau sudah tidak aktif.',
            },
          });
        }

        const isAdminEmail = verified.email === ADMIN_EMAIL && verified.emailVerified;
        const roleExpired =
          !isAdminEmail &&
          userDoc.role !== 'free' &&
          userDoc.roleExpiresAt > 0 &&
          Date.now() >= userDoc.roleExpiresAt;

        const effectiveRole = isAdminEmail
          ? 'admin'
          : roleExpired
          ? 'free'
          : userDoc.role;
        const isAdmin = isAdminEmail || effectiveRole === 'admin';
        const dailyLimit = isAdmin ? -1 : roleExpired ? 10 : userDoc.dailyLimit;
        const isUnlimited = isAdmin || dailyLimit === -1;
        const effectiveExpiresAt = isAdminEmail || roleExpired ? 0 : userDoc.roleExpiresAt;

        if (!isAdmin && userDoc.suspended) {
          apiKeyRegistry.set(userDoc.apiKey, {
            uid: verified.uid,
            email: verified.email,
            role: effectiveRole,
            apiKey: userDoc.apiKey,
            dailyLimit,
            creditsUsedToday: userDoc.creditsUsedToday,
            creditsResetDate: userDoc.creditsResetDate,
            roleExpiresAt: effectiveExpiresAt,
            suspended: true,
            suspendedReason: userDoc.suspendedReason,
            idToken,
          });
          return res.status(403).json({
            sukses: false,
            kesalahan: {
              kode: 'AKUN_DISUSPEND',
              pesan: userDoc.suspendedReason
                ? `Akun Anda sedang disuspend oleh Administrator (${userDoc.suspendedReason}). Akses API dinonaktifkan sementara.`
                : 'Akun Anda sedang disuspend oleh Administrator. Hubungi kontak dukungan jika memerlukan peninjauan.',
              alasan: userDoc.suspendedReason || undefined,
            },
          });
        }

        if (roleExpired) {
          await resetExpiredRoleInFirestore(verified.uid, idToken);
        }

        const usedToday = userDoc.creditsResetDate === today ? userDoc.creditsUsedToday : 0;

        // Enforce Private Endpoint RBAC before deducting credits (Admin ALWAYS has access)
        if (isPrivateEndpoint && !isAdmin && !allowedPrivateRoles.has(effectiveRole)) {
          apiKeyRegistry.set(userDoc.apiKey, {
            uid: verified.uid,
            email: verified.email,
            role: effectiveRole,
            apiKey: userDoc.apiKey,
            dailyLimit,
            creditsUsedToday: usedToday,
            creditsResetDate: today,
            roleExpiresAt: effectiveExpiresAt,
            idToken,
          });
          res.setHeader('X-API-Role', effectiveRole);
          return res.status(403).json({
            sukses: false,
            kesalahan: {
              kode: 'ENDPOINT_PRIVATE_FORBIDDEN',
              pesan: roleExpired
                ? 'Masa aktif role Anda telah habis dan akun otomatis kembali ke Free. Endpoint Private ini hanya dapat diakses oleh role yang diizinkan.'
                : 'Endpoint ini bersifat Private dan hanya dapat diakses oleh role yang diizinkan.',
              role_anda: effectiveRole,
              role_diizinkan: ['admin', ...Array.from(allowedPrivateRoles)],
            },
          });
        }

        if (!isUnlimited && usedToday >= dailyLimit) {
          res.setHeader('X-Credits-Limit', String(dailyLimit));
          res.setHeader('X-Credits-Used', String(usedToday));
          res.setHeader('X-Credits-Remaining', '0');
          return res.status(429).json({
            sukses: false,
            kesalahan: {
              kode: 'KUOTA_HARIAN_HABIS',
              pesan: `Kuota harian role ${effectiveRole.toUpperCase()} (${dailyLimit} kredit/hari) telah habis. Silakan upgrade paket atau tunggu reset harian.`,
              terpakai: usedToday,
              batas_harian: dailyLimit,
            },
          });
        }

        const nextUsed = usedToday + 1;
        const updated = await incrementCreditInFirestore(verified.uid, idToken, nextUsed, today);
        if (!updated && !isUnlimited) {
          res.setHeader('X-Credits-Limit', String(dailyLimit));
          res.setHeader('X-Credits-Used', String(usedToday));
          res.setHeader('X-Credits-Remaining', '0');
          return res.status(429).json({
            sukses: false,
            kesalahan: {
              kode: 'KUOTA_HARIAN_HABIS',
              pesan: 'Permintaan ditolak oleh pembatasan kuota harian.',
            },
          });
        }

        // Sync cache
        apiKeyRegistry.set(userDoc.apiKey, {
          uid: verified.uid,
          email: verified.email,
          role: effectiveRole,
          apiKey: userDoc.apiKey,
          dailyLimit,
          creditsUsedToday: nextUsed,
          creditsResetDate: today,
          roleExpiresAt: effectiveExpiresAt,
          suspended: false,
          suspendedReason: '',
          idToken,
        });

        res.setHeader('X-API-Role', effectiveRole);
        res.setHeader('X-Credits-Limit', isUnlimited ? 'unlimited' : String(dailyLimit));
        res.setHeader('X-Credits-Used', String(nextUsed));
        res.setHeader(
          'X-Credits-Remaining',
          isUnlimited ? 'unlimited' : String(Math.max(0, dailyLimit - nextUsed))
        );
        return next();
      }

      // Path B: External cURL / backend call using x-efemma-key
      if (!apiKey) {
        return res.status(401).json({
          sukses: false,
          kesalahan: {
            kode: 'AUTENTIKASI_DIPERLUKAN',
            pesan: 'Login dengan Google atau sertakan header x-efemma-key yang valid untuk mengakses endpoint EfemmaAPI.',
          },
        });
      }

      const cached = apiKeyRegistry.get(apiKey);
      if (!cached) {
        return res.status(401).json({
          sukses: false,
          kesalahan: {
            kode: 'API_KEY_TIDAK_TERDAFTAR',
            pesan: 'Header x-efemma-key tidak dikenali atau sudah diganti. Masuk ke dashboard untuk melihat kunci aktif Anda.',
          },
        });
      }

      // Check & auto-downgrade expired role without altering API key
      const roleWasExpired = await enforceRoleExpirationOnSession(cached);

      const isAdmin = cached.role === 'admin' || cached.email === ADMIN_EMAIL;
      if (!isAdmin && cached.suspended) {
        return res.status(403).json({
          sukses: false,
          kesalahan: {
            kode: 'AKUN_DISUSPEND',
            pesan: cached.suspendedReason
              ? `Akun Anda sedang disuspend oleh Administrator (${cached.suspendedReason}). Akses API dinonaktifkan sementara.`
              : 'Akun Anda sedang disuspend oleh Administrator. Akses API dinonaktifkan sementara.',
            alasan: cached.suspendedReason || undefined,
          },
        });
      }

      const effectiveRole = isAdmin ? 'admin' : cached.role;
      const isUnlimited = isAdmin || cached.dailyLimit === -1;
      const usedToday = cached.creditsResetDate === today ? cached.creditsUsedToday : 0;

      // Enforce Private Endpoint RBAC before deducting credits (Admin ALWAYS has access)
      if (isPrivateEndpoint && !isAdmin && !allowedPrivateRoles.has(effectiveRole)) {
        res.setHeader('X-API-Role', effectiveRole);
        return res.status(403).json({
          sukses: false,
          kesalahan: {
            kode: 'ENDPOINT_PRIVATE_FORBIDDEN',
            pesan: roleWasExpired
              ? 'Masa aktif role Anda telah habis dan akun otomatis direset ke Free. API Key ini tidak lagi diizinkan mengakses endpoint Private.'
              : 'Endpoint ini bersifat Private dan hanya dapat diakses oleh role yang diizinkan.',
            role_anda: effectiveRole,
            role_diizinkan: ['admin', ...Array.from(allowedPrivateRoles)],
          },
        });
      }

      if (!isUnlimited && usedToday >= cached.dailyLimit) {
        res.setHeader('X-Credits-Limit', String(cached.dailyLimit));
        res.setHeader('X-Credits-Used', String(usedToday));
        res.setHeader('X-Credits-Remaining', '0');
        return res.status(429).json({
          sukses: false,
          kesalahan: {
            kode: 'KUOTA_HARIAN_HABIS',
            pesan: `Kuota harian (${cached.dailyLimit} kredit/hari) untuk API Key ini telah habis.`,
            terpakai: usedToday,
            batas_harian: cached.dailyLimit,
          },
        });
      }

      const nextUsed = usedToday + 1;
      cached.creditsUsedToday = nextUsed;
      cached.creditsResetDate = today;
      if (cached.idToken) {
        await incrementCreditInFirestore(cached.uid, cached.idToken, nextUsed, today);
      }

      res.setHeader('X-API-Role', effectiveRole);
      res.setHeader('X-Credits-Limit', isUnlimited ? 'unlimited' : String(cached.dailyLimit));
      res.setHeader('X-Credits-Used', String(nextUsed));
      res.setHeader(
        'X-Credits-Remaining',
        isUnlimited ? 'unlimited' : String(Math.max(0, cached.dailyLimit - nextUsed))
      );
      return next();
    } catch (err) {
      return next(err);
    }
  });

  // 1. GET /api/v1/cuaca/sekarang
  app.get('/api/v1/cuaca/sekarang', async (req: Request, res: Response) => {
    const kota = String(req.query.kota || 'Jakarta').trim();
    const unit =
      String(req.query.unit || 'celsius').toLowerCase() === 'fahrenheit'
        ? 'fahrenheit'
        : 'celsius';

    if (!kota) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'PARAMETER_KOSONG',
          pesan: 'Parameter query "kota" wajib diisi.',
        },
      });
    }

    const lokasi = await resolveCityCoordinates(kota);
    if (!lokasi) {
      return res.status(404).json({
        sukses: false,
        kesalahan: {
          kode: 'KOTA_TIDAK_DITEMUKAN',
          pesan: `Lokasi "${kota}" tidak ditemukan pada indeks geokode.`,
        },
      });
    }

    try {
      const unitParam = unit === 'fahrenheit' ? '&temperature_unit=fahrenheit' : '';
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lokasi.lintang}&longitude=${lokasi.bujur}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure&timezone=auto${unitParam}`;
      const weatherData = await fetchJsonWithTimeout<{
        current: {
          time: string;
          temperature_2m: number;
          relative_humidity_2m: number;
          apparent_temperature: number;
          weather_code: number;
          wind_speed_10m: number;
          surface_pressure: number;
        };
      }>(weatherUrl, 4500);

      const c = weatherData.current;
      return res.json({
        sukses: true,
        layanan: 'cuaca-sekarang',
        sumber_data: 'open-meteo-live',
        lokasi: {
          kota: lokasi.nama,
          negara: lokasi.negara,
          kode_negara: lokasi.kode_negara,
          koordinat: {
            lintang: lokasi.lintang,
            bujur: lokasi.bujur,
          },
          zona_waktu: lokasi.zona_waktu,
        },
        cuaca: {
          waktu_pengamatan: c.time,
          kondisi: deskripsiCuacaWmo(c.weather_code),
          kode_wmo: c.weather_code,
          suhu: c.temperature_2m,
          terasa_seperti: c.apparent_temperature,
          satuan_suhu: unit === 'fahrenheit' ? '°F' : '°C',
          kelembapan_persen: c.relative_humidity_2m,
          kecepatan_angin_kmj: c.wind_speed_10m,
          tekanan_permukaan_hpa: c.surface_pressure,
        },
      });
    } catch {
      const fb = FALLBACK_CITIES[kota.toLowerCase()] ?? FALLBACK_CITIES.jakarta;
      const suhu = unit === 'fahrenheit' ? Number(((fb.suhu_c * 9) / 5 + 32).toFixed(1)) : fb.suhu_c;
      return res.json({
        sukses: true,
        layanan: 'cuaca-sekarang',
        sumber_data: 'efemma-regional-cache',
        lokasi: {
          kota: lokasi.nama,
          negara: lokasi.negara,
          kode_negara: lokasi.kode_negara,
          koordinat: {
            lintang: lokasi.lintang,
            bujur: lokasi.bujur,
          },
          zona_waktu: lokasi.zona_waktu,
        },
        cuaca: {
          waktu_pengamatan: new Date().toISOString(),
          kondisi: deskripsiCuacaWmo(fb.kode_wmo),
          kode_wmo: fb.kode_wmo,
          suhu,
          terasa_seperti: Number((suhu + 1.4).toFixed(1)),
          satuan_suhu: unit === 'fahrenheit' ? '°F' : '°C',
          kelembapan_persen: fb.kelembapan,
          kecepatan_angin_kmj: fb.angin_kmj,
          tekanan_permukaan_hpa: 1011.2,
        },
      });
    }
  });

  // 2. GET /api/v1/cuaca/prakiraan
  app.get('/api/v1/cuaca/prakiraan', async (req: Request, res: Response) => {
    const kota = String(req.query.kota || 'Bandung').trim();
    const hariRaw = Number(req.query.hari ?? 3);
    const hari = Number.isFinite(hariRaw) ? Math.min(7, Math.max(1, Math.floor(hariRaw))) : 3;

    const lokasi = await resolveCityCoordinates(kota);
    if (!lokasi) {
      return res.status(404).json({
        sukses: false,
        kesalahan: {
          kode: 'KOTA_TIDAK_DITEMUKAN',
          pesan: `Lokasi "${kota}" tidak ditemukan pada indeks geokode.`,
        },
      });
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lokasi.lintang}&longitude=${lokasi.bujur}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max&forecast_days=${hari}&timezone=auto`;
      const data = await fetchJsonWithTimeout<{
        daily: {
          time: string[];
          weather_code: number[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_sum: number[];
          wind_speed_10m_max: number[];
          uv_index_max: number[];
        };
      }>(url, 4500);

      const daftar = data.daily.time.map((tanggal, idx) => ({
        tanggal,
        kondisi: deskripsiCuacaWmo(data.daily.weather_code[idx]),
        kode_wmo: data.daily.weather_code[idx],
        suhu_maks_c: data.daily.temperature_2m_max[idx],
        suhu_min_c: data.daily.temperature_2m_min[idx],
        curah_hujan_mm: data.daily.precipitation_sum[idx],
        angin_maks_kmj: data.daily.wind_speed_10m_max[idx],
        indeks_uv_maks: data.daily.uv_index_max[idx],
      }));

      return res.json({
        sukses: true,
        layanan: 'cuaca-prakiraan',
        sumber_data: 'open-meteo-live',
        lokasi: {
          kota: lokasi.nama,
          negara: lokasi.negara,
          zona_waktu: lokasi.zona_waktu,
        },
        jumlah_hari: daftar.length,
        prakiraan: daftar,
      });
    } catch {
      const fb = FALLBACK_CITIES[kota.toLowerCase()] ?? FALLBACK_CITIES.bandung;
      const now = new Date();
      const daftar = Array.from({ length: hari }, (_, idx) => {
        const d = new Date(now.getTime() + idx * 86400000);
        return {
          tanggal: d.toISOString().slice(0, 10),
          kondisi: deskripsiCuacaWmo(idx % 2 === 0 ? fb.kode_wmo : 2),
          kode_wmo: idx % 2 === 0 ? fb.kode_wmo : 2,
          suhu_maks_c: Number((fb.suhu_c + 3.2 - idx * 0.3).toFixed(1)),
          suhu_min_c: Number((fb.suhu_c - 4.1 + idx * 0.2).toFixed(1)),
          curah_hujan_mm: idx % 2 === 0 ? 4.2 : 0.4,
          angin_maks_kmj: Number((fb.angin_kmj + 3.5).toFixed(1)),
          indeks_uv_maks: 7.4,
        };
      });

      return res.json({
        sukses: true,
        layanan: 'cuaca-prakiraan',
        sumber_data: 'efemma-regional-cache',
        lokasi: {
          kota: lokasi.nama,
          negara: lokasi.negara,
          zona_waktu: lokasi.zona_waktu,
        },
        jumlah_hari: daftar.length,
        prakiraan: daftar,
      });
    }
  });

  async function getExchangeRates(dasar: string): Promise<{
    rates: Record<string, number>;
    sumber: string;
    diperbarui: string;
  } | null> {
    const base = dasar.toUpperCase();
    try {
      const live = await fetchJsonWithTimeout<{
        result: string;
        time_last_update_utc: string;
        rates: Record<string, number>;
      }>(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, 4500);

      if (live.result === 'success' && live.rates) {
        return {
          rates: live.rates,
          sumber: 'open-er-api-live',
          diperbarui: live.time_last_update_utc,
        };
      }
    } catch {
      try {
        const frank = await fetchJsonWithTimeout<{
          date: string;
          rates: Record<string, number>;
        }>(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`, 3500);
        if (frank.rates) {
          return {
            rates: { ...frank.rates, [base]: 1 },
            sumber: 'frankfurter-ecb-live',
            diperbarui: frank.date,
          };
        }
      } catch {
        // Fallback below
      }
    }

    if (!BASE_USD_RATES[base]) {
      return null;
    }

    const baseInUsd = BASE_USD_RATES[base];
    const computed: Record<string, number> = {};
    for (const [code, usdVal] of Object.entries(BASE_USD_RATES)) {
      computed[code] = Number((usdVal / baseInUsd).toFixed(6));
    }
    return {
      rates: computed,
      sumber: 'efemma-reference-rates',
      diperbarui: new Date().toISOString(),
    };
  }

  // 3. GET /api/v1/kurs/konversi
  app.get('/api/v1/kurs/konversi', async (req: Request, res: Response) => {
    const dari = String(req.query.dari || 'USD').trim().toUpperCase();
    const ke = String(req.query.ke || 'IDR').trim().toUpperCase();
    const jumlah = Number(req.query.jumlah ?? 100);

    if (!/^[A-Z]{3}$/.test(dari) || !/^[A-Z]{3}$/.test(ke)) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'KODE_MATA_UANG_TIDAK_VALID',
          pesan: 'Kode mata uang harus berupa 3 huruf ISO-4217 (contoh: USD, IDR, EUR).',
        },
      });
    }

    if (!Number.isFinite(jumlah) || jumlah < 0) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'JUMLAH_TIDAK_VALID',
          pesan: 'Parameter "jumlah" harus berupa angka bernilai 0 atau lebih.',
        },
      });
    }

    const dataKurs = await getExchangeRates(dari);
    if (!dataKurs || dataKurs.rates[ke] === undefined) {
      return res.status(404).json({
        sukses: false,
        kesalahan: {
          kode: 'PASANGAN_KURS_TIDAK_TERSEDIA',
          pesan: `Pasangan konversi ${dari} ke ${ke} tidak tersedia saat ini.`,
        },
      });
    }

    const kurs = dataKurs.rates[ke];
    const hasil = Number((jumlah * kurs).toFixed(ke === 'IDR' || ke === 'JPY' || ke === 'KRW' ? 2 : 4));

    return res.json({
      sukses: true,
      layanan: 'kurs-konversi',
      sumber_data: dataKurs.sumber,
      diperbarui_pada: dataKurs.diperbarui,
      konversi: {
        dari,
        ke,
        jumlah_awal: jumlah,
        kurs_tukar: kurs,
        hasil_konversi: hasil,
      },
    });
  });

  // 4. GET /api/v1/kurs/daftar
  app.get('/api/v1/kurs/daftar', async (req: Request, res: Response) => {
    const dasar = String(req.query.dasar || 'IDR').trim().toUpperCase();
    const simbolRaw = String(req.query.simbol || 'USD,EUR,SGD,MYR,JPY,GBP,AUD').trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(dasar)) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'KODE_MATA_UANG_TIDAK_VALID',
          pesan: 'Parameter "dasar" harus berupa 3 huruf kode ISO-4217.',
        },
      });
    }

    const dataKurs = await getExchangeRates(dasar);
    if (!dataKurs) {
      return res.status(404).json({
        sukses: false,
        kesalahan: {
          kode: 'MATA_UANG_TIDAK_DITEMUKAN',
          pesan: `Mata uang dasar "${dasar}" tidak dikenali.`,
        },
      });
    }

    const targetList = simbolRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[A-Z]{3}$/.test(s));

    const kursTersaring: Record<string, { nilai_per_1_dasar: number; nilai_terbalik: number }> = {};
    for (const kode of targetList) {
      const rate = dataKurs.rates[kode];
      if (rate !== undefined && rate > 0) {
        kursTersaring[kode] = {
          nilai_per_1_dasar: rate,
          nilai_terbalik: Number((1 / rate).toFixed(4)),
        };
      }
    }

    return res.json({
      sukses: true,
      layanan: 'kurs-daftar',
      mata_uang_dasar: dasar,
      sumber_data: dataKurs.sumber,
      diperbarui_pada: dataKurs.diperbarui,
      kurs: kursTersaring,
    });
  });

  // 5. GET /api/v1/integrasi/ip-lookup
  app.get('/api/v1/integrasi/ip-lookup', async (req: Request, res: Response) => {
    const ipParam = String(req.query.ip || '8.8.8.8').trim();
    if (!isValidIp(ipParam)) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'IP_TIDAK_VALID',
          pesan: 'Format alamat IPv4 atau IPv6 tidak valid.',
        },
      });
    }

    try {
      const geo = await fetchJsonWithTimeout<{
        success: boolean;
        ip: string;
        type: string;
        continent: string;
        country: string;
        country_code: string;
        region: string;
        city: string;
        latitude: number;
        longitude: number;
        connection?: { asn?: number; org?: string; isp?: string; domain?: string };
        timezone?: { id?: string; utc?: string };
      }>(`https://ipwho.is/${encodeURIComponent(ipParam)}`, 4000);

      if (geo.success) {
        return res.json({
          sukses: true,
          layanan: 'integrasi-ip-lookup',
          sumber_data: 'ipwhois-live',
          data: {
            ip: geo.ip,
            versi: geo.type,
            benua: geo.continent,
            negara: geo.country,
            kode_negara: geo.country_code,
            wilayah: geo.region,
            kota: geo.city,
            koordinat: {
              lintang: geo.latitude,
              bujur: geo.longitude,
            },
            jaringan: {
              asn: geo.connection?.asn ?? null,
              organisasi: geo.connection?.org ?? null,
              isp: geo.connection?.isp ?? null,
              domain: geo.connection?.domain ?? null,
            },
            zona_waktu: geo.timezone?.id ?? 'UTC',
          },
        });
      }
    } catch {
      // Fallback below
    }

    const knownIps: Record<
      string,
      { org: string; isp: string; asn: number; kota: string; negara: string; kode: string }
    > = {
      '8.8.8.8': {
        org: 'Google LLC',
        isp: 'Google Public DNS',
        asn: 15169,
        kota: 'Mountain View',
        negara: 'United States',
        kode: 'US',
      },
      '1.1.1.1': {
        org: 'Cloudflare, Inc.',
        isp: 'Cloudflare Resolver',
        asn: 13335,
        kota: 'Sydney',
        negara: 'Australia',
        kode: 'AU',
      },
    };
    const fallback = knownIps[ipParam] ?? {
      org: 'Public Network Registry',
      isp: 'Global Transit Provider',
      asn: 64512,
      kota: 'Jakarta',
      negara: 'Indonesia',
      kode: 'ID',
    };

    return res.json({
      sukses: true,
      layanan: 'integrasi-ip-lookup',
      sumber_data: 'efemma-geo-registry',
      data: {
        ip: ipParam,
        versi: ipParam.includes(':') ? 'IPv6' : 'IPv4',
        negara: fallback.negara,
        kode_negara: fallback.kode,
        kota: fallback.kota,
        jaringan: {
          asn: fallback.asn,
          organisasi: fallback.org,
          isp: fallback.isp,
        },
        zona_waktu: 'UTC',
      },
    });
  });

  // 6. GET /api/v1/integrasi/meta-url
  app.get('/api/v1/integrasi/meta-url', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || 'https://example.com').trim();
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'URL_TIDAK_VALID',
          pesan: 'Masukkan URL lengkap yang diawali dengan http:// atau https://',
        },
      });
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateOrLocalHost(parsed.hostname)) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'HOST_DITOLAK',
          pesan: 'Hanya URL publik HTTP/HTTPS yang diizinkan untuk ekstraksi metadata.',
        },
      });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const upstream = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'EfemmaAPI-MetaInspector/1.0' },
      });
      clearTimeout(timer);

      const html = (await upstream.text()).slice(0, 65536);
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch =
        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
      const ogTitleMatch =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ??
        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
      const ogDescMatch =
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ??
        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i);

      return res.json({
        sukses: true,
        layanan: 'integrasi-meta-url',
        url_target: parsed.toString(),
        status_http_target: upstream.status,
        content_type: upstream.headers.get('content-type') ?? 'text/html',
        metadata: {
          judul: titleMatch?.[1]?.trim() || null,
          deskripsi: descMatch?.[1]?.trim() || null,
          og_title: ogTitleMatch?.[1]?.trim() || null,
          og_description: ogDescMatch?.[1]?.trim() || null,
          domain: parsed.hostname,
        },
      });
    } catch {
      return res.status(502).json({
        sukses: false,
        kesalahan: {
          kode: 'UPSTREAM_TIDAK_TERJANGKAU',
          pesan: `Gagal mengambil dokumen HTML dari ${parsed.hostname}.`,
        },
      });
    }
  });

  // 7. POST /api/v1/integrasi/webhook-sign
  app.post('/api/v1/integrasi/webhook-sign', (req: Request, res: Response) => {
    const body = req.body as {
      event?: string;
      secret?: string;
      payload?: Record<string, unknown>;
    };

    if (!body || typeof body !== 'object' || !body.event || typeof body.event !== 'string') {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'PAYLOAD_TIDAK_LENGKAP',
          pesan: 'Body JSON wajib menyertakan field "event" (string) dan objek "payload".',
        },
      });
    }

    const secret =
      typeof body.secret === 'string' && body.secret.length > 0 ? body.secret : 'efemma_whsec_default';
    const payloadObj = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const timestamp = Math.floor(Date.now() / 1000);
    const serialized = JSON.stringify({ event: body.event, data: payloadObj });
    const signedInput = `${timestamp}.${serialized}`;

    const hmacSignature = crypto.createHmac('sha256', secret).update(signedInput).digest('hex');
    const payloadHash = crypto.createHash('sha256').update(serialized).digest('hex');

    return res.json({
      sukses: true,
      layanan: 'integrasi-webhook-sign',
      algoritma: 'HMAC-SHA256',
      timestamp,
      header_verifikasi: {
        'X-Efemma-Event': body.event,
        'X-Efemma-Timestamp': String(timestamp),
        'X-Efemma-Signature': `t=${timestamp},v1=${hmacSignature}`,
      },
      ringkasan: {
        hash_payload_sha256: payloadHash,
        panjang_byte: Buffer.byteLength(serialized, 'utf8'),
        event: body.event,
      },
    });
  });

  // =========================================================================
  // PURE SPOTIFY WEB SCRAPER & YOUTUBE IFRAME FULL SONG (Zero Keys/Secrets)
  // =========================================================================
  interface SpotifyScrapeBundle {
    totpSecretRaw: string;
    totpVersion: number;
    hashes: Record<string, string>;
    fetchedAt: number;
  }

  interface SpotifyScrapeSession {
    accessToken: string;
    clientId: string;
    clientToken: string;
    expiresAt: number;
  }

  const DEFAULT_PATHFINDER_HASHES: Record<string, string> = {
    getTrack: 'e7b1bf4e95cb3d733d48b442f93006e9712fd504e8b88d7a82e6e3bac9306a6b',
    queryArtistOverview: 'eafb1620d783ece118e72fbfede2b0064483e029d3c1aafafa1c2de0e25a89e7',
    getAlbum: '0b6ce3511e1b02e4a40fa95440f992acbe85080eb308af9194322d708fc1914f',
    fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
    queryShowMetadataV2: 'b475447846f37cc426add800b995a7859c169c53c72b62de6338c0c40a5dacea',
    queryPodcastEpisodes: '3539d746cf882f3909660de40b4ef472b3f5893a0761d617c282541de5d412c5',
    home: '5fb7da7a03ee2776c0670856609cb85a189a3cecc36cc160b91cde79063b9cf1',
    browseAll: 'dbd8b55e09a58afc52eab438bc228ba28fd72ac2f2148c6c26354980e4579001',
    browsePage: 'f5c4e6d668f5716464a231c1cc8b22c1cbf6ad68b09929fd7de813a30581298b',
    browseSection: 'b13c1cccbfcb6947753c2613411b3566485c21fd5f36d80a80bb64be61ba2d51',
    searchDesktop: 'eef7cc54888d91bdd6802623477873caa3948ae173a0c34fd86827b267e94c03',
    fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
    editablePlaylists: 'd5c4b8096437dcc2ac9528c91dfcd299e35b747cda2f8f75d28f41f49c5092ba',
  };

  let cachedBundle: SpotifyScrapeBundle | null = null;
  let cachedAnonSession: SpotifyScrapeSession | null = null;

  function computeSpotifyTotp(ms: number, rawSecret: string): string {
    const transformed = rawSecret
      .split('')
      .map((ch, idx) => ch.charCodeAt(0) ^ ((idx % 33) + 9))
      .join('');
    const keyBuf = Buffer.from(Buffer.from(transformed, 'utf8').toString('hex'), 'hex');
    const counter = Math.floor(ms / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', keyBuf).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  }

  function extractPersistedOpsFromJs(js: string, hashes: Record<string, string>) {
    const ops = js.matchAll(
      /new [a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\("([^"]+)","query","([a-f0-9]{64})"/g
    );
    for (const m of ops) {
      hashes[m[1]] = m[2];
    }
  }

  function unescapeJsStringLiteral(quote: string, inner: string): string {
    let out = '';
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '\\' && i + 1 < inner.length) {
        const next = inner[++i];
        if (next === 'n') out += '\n';
        else if (next === 'r') out += '\r';
        else if (next === 't') out += '\t';
        else if (next === 'x' && i + 2 < inner.length) {
          out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 3), 16));
          i += 2;
        } else if (next === 'u' && i + 4 < inner.length) {
          out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 5), 16));
          i += 4;
        } else {
          out += next || quote;
        }
      } else {
        out += ch;
      }
    }
    return out;
  }

  async function loadSpotifyScrapeBundle(forceRefresh = false): Promise<SpotifyScrapeBundle> {
    if (!forceRefresh && cachedBundle && Date.now() - cachedBundle.fetchedAt < 3600_000) {
      return cachedBundle;
    }

    const homeRes = await fetch('https://open.spotify.com/', {
      headers: { 'User-Agent': SCRAPE_UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
    });
    if (!homeRes.ok) {
      throw new Error(`Gagal membuka open.spotify.com (HTTP ${homeRes.status})`);
    }
    const homeHtml = await homeRes.text();
    const jsUrlMatch = homeHtml.match(
      /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[a-f0-9]+\.js/
    );
    if (!jsUrlMatch) {
      throw new Error('Gagal menemukan skrip web-player dari open.spotify.com');
    }

    const hashes: Record<string, string> = { ...DEFAULT_PATHFINDER_HASHES };
    const mainJsRes = await fetch(jsUrlMatch[0], { headers: { 'User-Agent': SCRAPE_UA } });
    if (!mainJsRes.ok) {
      throw new Error(`Gagal mengunduh web-player bundle (HTTP ${mainJsRes.status})`);
    }
    const mainJs = await mainJsRes.text();
    extractPersistedOpsFromJs(mainJs, hashes);

    const arrMatch = mainJs.match(
      /\[\{\s*secret:\s*(['"])((?:\\.|(?!\1).)+)\1\s*,\s*version:\s*(\d+)/
    );
    if (!arrMatch) {
      throw new Error('Gagal mengekstrak konfigurasi TOTP dari web-player Spotify');
    }
    const totpSecretRaw = unescapeJsStringLiteral(arrMatch[1], arrMatch[2]);
    const totpVersion = Number(arrMatch[3]);

    // Extract lazy chunk hashes for searchDesktop & browsePage
    const cdnTag = homeHtml.match(/<script[^>]*id="__CDN_FILE_URLS__"[^>]*>([\s\S]*?)<\/script>/);
    if (cdnTag?.[1]) {
      try {
        const cdnJson = JSON.parse(
          Buffer.from(cdnTag[1], 'base64').toString('utf8')
        ) as Record<string, string>;
        const chunkUrls = Object.entries(cdnJson)
          .filter(
            ([k, v]) =>
              typeof v === 'string' &&
              /^build\/web-player\/(?:xpui-routes-search|browse-v2)\.[a-f0-9]+\.js$/.test(k)
          )
          .map(([, v]) => v);
        await Promise.all(
          chunkUrls.map(async (u) => {
            try {
              const r = await fetch(u, { headers: { 'User-Agent': SCRAPE_UA } });
              if (r.ok) extractPersistedOpsFromJs(await r.text(), hashes);
            } catch {
              // Keep defaults
            }
          })
        );
      } catch {
        // Keep defaults
      }
    }

    cachedBundle = { totpSecretRaw, totpVersion, hashes, fetchedAt: Date.now() };
    return cachedBundle;
  }

  async function getSpotifyWebSession(
    options: { forceRefresh?: boolean; spDcCookie?: string } = {}
  ): Promise<SpotifyScrapeSession> {
    const spDc = (options.spDcCookie || '').trim();
    if (!spDc && !options.forceRefresh && cachedAnonSession && Date.now() < cachedAnonSession.expiresAt - 60_000) {
      return cachedAnonSession;
    }

    const bundle = await loadSpotifyScrapeBundle(Boolean(options.forceRefresh));
    const stRes = await fetch('https://open.spotify.com/api/server-time', {
      headers: { 'User-Agent': SCRAPE_UA },
    });
    const stJson = stRes.ok ? ((await stRes.json()) as { serverTime?: number }) : {};
    const nowMs = Date.now();
    const serverMs = stJson.serverTime ? stJson.serverTime * 1000 : nowMs;

    const qs = new URLSearchParams({
      reason: 'init',
      productType: 'web-player',
      totp: computeSpotifyTotp(nowMs, bundle.totpSecretRaw),
      totpServer: computeSpotifyTotp(serverMs, bundle.totpSecretRaw),
      totpVer: String(bundle.totpVersion),
    });

    const tokRes = await fetch(`https://open.spotify.com/api/token?${qs.toString()}`, {
      headers: {
        'User-Agent': SCRAPE_UA,
        Origin: 'https://open.spotify.com',
        Referer: 'https://open.spotify.com/',
        ...(spDc ? { Cookie: `sp_dc=${spDc}` } : {}),
      },
    });
    if (!tokRes.ok) {
      const errBody = await tokRes.text();
      throw new Error(`Gagal memperoleh sesi web Spotify (${tokRes.status}): ${errBody.slice(0, 140)}`);
    }
    const tokData = (await tokRes.json()) as {
      accessToken: string;
      clientId: string;
      accessTokenExpirationTimestampMs?: number;
    };

    const ctRes = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': SCRAPE_UA,
      },
      body: JSON.stringify({
        client_data: {
          client_version: '1.2.52.442.g3a96f552',
          client_id: tokData.clientId,
          js_sdk_data: {
            device_brand: 'unknown',
            device_model: 'unknown',
            os: 'windows',
            os_version: 'NT 10.0',
            device_id: crypto.randomUUID(),
            device_type: 'computer',
          },
        },
      }),
    });
    const ctJson = (await ctRes.json()) as { granted_token?: { token?: string } };
    const clientToken = ctJson?.granted_token?.token || '';
    if (!clientToken) {
      throw new Error('Gagal memperoleh client-token dari web Spotify.');
    }

    const session: SpotifyScrapeSession = {
      accessToken: tokData.accessToken,
      clientId: tokData.clientId,
      clientToken,
      expiresAt: tokData.accessTokenExpirationTimestampMs || Date.now() + 30 * 60_000,
    };
    if (!spDc) cachedAnonSession = session;
    return session;
  }

  async function callSpotifyPathfinder<T = Record<string, unknown>>(
    operationName: string,
    variables: Record<string, unknown>,
    spDcCookie?: string
  ): Promise<T> {
    const execute = async (forceRefresh: boolean): Promise<{ ok: boolean; status: number; json: T | null; raw: string }> => {
      const bundle = await loadSpotifyScrapeBundle(forceRefresh);
      const session = await getSpotifyWebSession({ forceRefresh, spDcCookie });
      const sha256Hash = bundle.hashes[operationName] || DEFAULT_PATHFINDER_HASHES[operationName];
      if (!sha256Hash) {
        throw new Error(`Hash operasi Spotify '${operationName}' tidak ditemukan.`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'client-token': session.clientToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': SCRAPE_UA,
            Origin: 'https://open.spotify.com',
            Referer: 'https://open.spotify.com/',
          },
          body: JSON.stringify({
            variables,
            operationName,
            extensions: { persistedQuery: { version: 1, sha256Hash } },
          }),
        });
        const raw = await res.text();
        let json: T | null = null;
        try {
          json = JSON.parse(raw) as T;
        } catch {
          json = null;
        }
        return { ok: res.ok, status: res.status, json, raw };
      } finally {
        clearTimeout(timer);
      }
    };

    let attempt = await execute(false);
    if (!attempt.ok && (attempt.status === 400 || attempt.status === 401)) {
      cachedBundle = null;
      cachedAnonSession = null;
      attempt = await execute(true);
    }
    if (!attempt.ok || !attempt.json) {
      throw new Error(`Spotify Pathfinder '${operationName}' HTTP ${attempt.status}: ${attempt.raw.slice(0, 180)}`);
    }
    return attempt.json;
  }

  function formatDurationMs(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function extractIdFromUri(uri?: string | null): string {
    if (!uri) return '';
    const parts = String(uri).split(':');
    return parts[parts.length - 1] || '';
  }

  function pickCover(obj: unknown): string | null {
    const o = obj as {
      sources?: Array<{ url?: string; width?: number }>;
      items?: Array<{ sources?: Array<{ url?: string }> }>;
      image_url?: string;
    } | null;
    if (!o) return null;
    if (typeof o.image_url === 'string') return o.image_url;
    if (Array.isArray(o.sources) && o.sources.length > 0) {
      return o.sources[o.sources.length - 1]?.url || o.sources[0]?.url || null;
    }
    if (Array.isArray(o.items) && o.items[0]?.sources?.length) {
      const s = o.items[0].sources;
      return s[s.length - 1]?.url || s[0]?.url || null;
    }
    return null;
  }

  interface NormalizedSpotifyTrack {
    id: string;
    uri: string;
    judul: string;
    artis: string[];
    artis_detail: Array<{ id: string; nama: string; spotify_url: string | null }>;
    album: { id: string; nama: string | null; tanggal_rilis: string | null; sampul: string | null } | null;
    durasi_ms: number;
    durasi_format: string;
    is_full_song: boolean;
    eksplisit: boolean;
    playcount: string | null;
    spotify_url: string | null;
  }

  function normalizePfTrack(raw: unknown, fallbackAlbum?: { id?: string; name?: string; cover?: string | null; releaseDate?: string | null }): NormalizedSpotifyTrack | null {
    const t = raw as Record<string, unknown> | null;
    if (!t) return null;
    const uri = String(t.uri || '');
    const id = String(t.id || extractIdFromUri(uri));
    if (!id || (!t.name && !uri.includes(':track:'))) return null;

    const artistsList: Array<{ id: string; nama: string; spotify_url: string | null }> = [];
    const firstArtistItems = ((t.firstArtist as { items?: Array<Record<string, unknown>> })?.items) || [];
    const otherArtistItems = ((t.otherArtists as { items?: Array<Record<string, unknown>> })?.items) || [];
    const directArtistItems = ((t.artists as { items?: Array<Record<string, unknown>> })?.items) || [];

    for (const a of [...firstArtistItems, ...otherArtistItems, ...directArtistItems]) {
      const aUri = String(a?.uri || '');
      const aId = String(a?.id || extractIdFromUri(aUri));
      const aName = String((a?.profile as { name?: string })?.name || a?.name || '').trim();
      if (aName && !artistsList.some((x) => x.nama === aName && x.id === aId)) {
        artistsList.push({
          id: aId,
          nama: aName,
          spotify_url: aId ? `https://open.spotify.com/artist/${aId}` : null,
        });
      }
    }

    const albumObj = (t.albumOfTrack || t.album) as Record<string, unknown> | undefined;
    const albumId = String(albumObj?.id || extractIdFromUri(String(albumObj?.uri || '')) || fallbackAlbum?.id || '');
    const albumName = (albumObj?.name as string) || fallbackAlbum?.name || null;
    const albumCover = pickCover(albumObj?.coverArt) || pickCover((t.visualIdentity as { image?: unknown }) ? { sources: (t.visualIdentity as { image?: Array<{ url?: string }> }).image } : null) || fallbackAlbum?.cover || null;
    const durationMs = Number(
      (t.duration as { totalMilliseconds?: number })?.totalMilliseconds ??
        (t.trackDuration as { totalMilliseconds?: number })?.totalMilliseconds ??
        t.duration_ms ??
        0
    );

    const ratingLabel = String((t.contentRating as { label?: string })?.label || '');
    return {
      id,
      uri: uri || `spotify:track:${id}`,
      judul: String(t.name || ''),
      artis: artistsList.map((a) => a.nama),
      artis_detail: artistsList,
      album: albumId || albumName || albumCover
        ? {
            id: albumId,
            nama: albumName,
            tanggal_rilis: fallbackAlbum?.releaseDate ?? null,
            sampul: albumCover,
          }
        : null,
      durasi_ms: durationMs,
      durasi_format: formatDurationMs(durationMs),
      is_full_song: true,
      eksplisit: ratingLabel === 'EXPLICIT' || Boolean(t.explicit),
      playcount: t.playcount ? String(t.playcount) : null,
      spotify_url: `https://open.spotify.com/track/${id}`,
    };
  }

  function normalizePfArtist(raw: unknown) {
    const a = raw as Record<string, unknown> | null;
    if (!a) return null;
    const uri = String(a.uri || '');
    const id = String(a.id || extractIdFromUri(uri));
    const profile = (a.profile as Record<string, unknown>) || {};
    const visuals = (a.visuals as Record<string, unknown>) || {};
    const stats = (a.stats as Record<string, unknown>) || {};
    const name = String(profile.name || a.name || '');
    if (!id || !name) return null;
    return {
      id,
      uri: uri || `spotify:artist:${id}`,
      nama: name,
      terverifikasi: Boolean(profile.verified),
      pengikut: typeof stats.followers === 'number' ? stats.followers : null,
      pendengar_bulanan: typeof stats.monthlyListeners === 'number' ? stats.monthlyListeners : null,
      foto: pickCover(visuals.avatarImage) || pickCover(a.avatarImage),
      spotify_url: `https://open.spotify.com/artist/${id}`,
    };
  }

  function normalizePfAlbum(raw: unknown) {
    const al = raw as Record<string, unknown> | null;
    if (!al) return null;
    const uri = String(al.uri || '');
    const id = String(al.id || extractIdFromUri(uri));
    const name = String(al.name || '');
    if (!id || !name) return null;
    const artistItems = ((al.artists as { items?: Array<Record<string, unknown>> })?.items) || [];
    const dateObj = al.date as { year?: number; isoString?: string } | undefined;
    return {
      id,
      uri: uri || `spotify:album:${id}`,
      nama: name,
      tipe: String(al.type || 'ALBUM').toLowerCase(),
      artis: artistItems
        .map((x) => String((x?.profile as { name?: string })?.name || x?.name || '').trim())
        .filter(Boolean),
      tanggal_rilis: dateObj?.isoString?.slice(0, 10) || (dateObj?.year ? String(dateObj.year) : null),
      sampul: pickCover(al.coverArt),
      spotify_url: `https://open.spotify.com/album/${id}`,
    };
  }

  function normalizePfPlaylist(raw: unknown) {
    const pl = raw as Record<string, unknown> | null;
    if (!pl) return null;
    const uri = String(pl.uri || '');
    const id = String(pl.id || extractIdFromUri(uri));
    const name = String(pl.name || '');
    if (!id || !name) return null;
    const owner = (pl.ownerV2 as { data?: { name?: string; username?: string } })?.data;
    return {
      id,
      uri: uri || `spotify:playlist:${id}`,
      nama: name,
      deskripsi: String(pl.description || ''),
      pemilik: owner?.name || owner?.username || null,
      total_lagu: (pl.content as { totalCount?: number })?.totalCount ?? null,
      sampul: pickCover(pl.images),
      spotify_url: `https://open.spotify.com/playlist/${id}`,
    };
  }

  function normalizePfPodcast(raw: unknown) {
    const s = raw as Record<string, unknown> | null;
    if (!s) return null;
    const uri = String(s.uri || '');
    const id = String(s.id || extractIdFromUri(uri));
    const name = String(s.name || '');
    if (!id || !name) return null;
    const rawMediaType = String(s.mediaType || '').toLowerCase();
    return {
      id,
      uri: uri || `spotify:show:${id}`,
      nama: name,
      penerbit: (s.publisher as { name?: string })?.name || null,
      deskripsi: String(s.description || ''),
      total_episode: (s.episodesV2 as { totalCount?: number })?.totalCount ?? null,
      jenis_media: rawMediaType || null,
      sampul: pickCover(s.coverArt),
      spotify_url: `https://open.spotify.com/show/${id}`,
    };
  }

  function episodeHasVideoFlag(ep: Record<string, unknown> | null): boolean {
    if (!ep) return false;
    const mediaTypes = Array.isArray(ep.mediaTypes)
      ? ep.mediaTypes.map((x) => String(x).toUpperCase())
      : [];
    if (mediaTypes.includes('VIDEO')) return true;
    const vpt = ep.videoPreviewThumbnail as { sources?: unknown[] } | null | undefined;
    if (vpt && Array.isArray(vpt.sources) && vpt.sources.length > 0) return true;
    return Boolean(ep.hasVideo);
  }

  function normalizePfEpisode(raw: unknown) {
    const ep = raw as Record<string, unknown> | null;
    if (!ep) return null;
    const uri = String(ep.uri || '');
    const id = String(ep.id || extractIdFromUri(uri));
    const name = String(ep.name || '');
    if (!id || !name) return null;
    const durMs = Number((ep.duration as { totalMilliseconds?: number })?.totalMilliseconds ?? 0);
    const hasVideo = episodeHasVideoFlag(ep);
    const podcastData = (ep.podcastV2 as { data?: Record<string, unknown> } | undefined)?.data;
    const showUri = String(podcastData?.uri || '');
    const showId = extractIdFromUri(showUri) || null;
    const showName = String(podcastData?.name || '').trim() || null;
    return {
      id,
      uri: uri || `spotify:episode:${id}`,
      judul: name,
      deskripsi: String(ep.description || ''),
      durasi_ms: durMs,
      durasi_format: formatDurationMs(durMs),
      tanggal_rilis: (ep.releaseDate as { isoString?: string })?.isoString?.slice(0, 10) || null,
      jenis_media: hasVideo ? ('video' as const) : ('audio' as const),
      show_id: showId,
      show_nama: showName,
      sampul: pickCover(ep.coverArt),
      spotify_url: `https://open.spotify.com/episode/${id}`,
    };
  }

  function unwrapSectionContent(item: Record<string, unknown> | null) {
    if (!item) return null;
    const content = (item.content as Record<string, unknown>) || item;
    const data = (content.data as Record<string, unknown>) || content;
    return {
      typename: String(data.__typename || content.__typename || ''),
      uri: String(data.uri || item.uri || ''),
      data,
    };
  }

  async function scrapeYouTubeVideos(
    searchQuery: string,
    mode: 'music' | 'podcast_video' = 'music'
  ) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': SCRAPE_UA,
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        },
      });
      if (!res.ok) {
        throw new Error(`YouTube search HTTP ${res.status}`);
      }
      const html = await res.text();
      const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
      if (!m) {
        throw new Error('Gagal mem-parsing ytInitialData dari YouTube.');
      }
      const parsed = JSON.parse(m[1]) as {
        contents?: {
          twoColumnSearchResultsRenderer?: {
            primaryContents?: {
              sectionListRenderer?: {
                contents?: Array<{
                  itemSectionRenderer?: {
                    contents?: Array<{
                      videoRenderer?: {
                        videoId?: string;
                        title?: { runs?: Array<{ text?: string }> };
                        lengthText?: { simpleText?: string };
                        ownerText?: { runs?: Array<{ text?: string }> };
                        thumbnail?: { thumbnails?: Array<{ url?: string }> };
                      };
                    }>;
                  };
                }>;
              };
            };
          };
        };
      };

      const sections =
        parsed.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents ?? [];
      const results: Array<{
        video_id: string;
        judul_youtube: string;
        channel: string;
        durasi_text: string;
        thumbnail: string | null;
        embed_url: string;
        watch_url: string;
      }> = [];

      for (const sec of sections) {
        const items = sec.itemSectionRenderer?.contents ?? [];
        for (const it of items) {
          const vr = it.videoRenderer;
          if (!vr?.videoId || !vr.lengthText?.simpleText) continue; // skip live streams/shorts without duration
          const title = vr.title?.runs?.map((r) => r.text).join('') || '';
          const channel = vr.ownerText?.runs?.[0]?.text || '';
          const thumbs = vr.thumbnail?.thumbnails ?? [];
          results.push({
            video_id: vr.videoId,
            judul_youtube: title,
            channel,
            durasi_text: vr.lengthText.simpleText,
            thumbnail: thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null,
            embed_url: `https://www.youtube.com/embed/${vr.videoId}?autoplay=1&enablejsapi=1`,
            watch_url: `https://www.youtube.com/watch?v=${vr.videoId}`,
          });
          if (results.length >= 8) break;
        }
        if (results.length >= 8) break;
      }

      const scored = results
        .map((v) => {
          const lower = `${v.judul_youtube} ${v.channel}`.toLowerCase();
          let score = 0;
          if (mode === 'podcast_video') {
            if (lower.includes('podcast') || lower.includes('full')) score += 4;
            if (lower.includes('#shorts') || lower.includes('clip') || lower.includes('potongan')) score -= 3;
            const durParts = v.durasi_text.split(':').length;
            if (durParts >= 3) score += 4; // >= 1 hour podcast episode
          } else {
            if (lower.includes('official audio')) score += 5;
            if (lower.includes('topic')) score += 4;
            if (lower.includes('official music video') || lower.includes('official video')) score += 3;
            if (lower.includes('lyric')) score += 2;
            if (lower.includes('cover') || lower.includes('remix') || lower.includes('karaoke')) score -= 4;
          }
          return { v, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.v);

      return scored;
    } finally {
      clearTimeout(timer);
    }
  }

  let cachedScClientId: { value: string; expiresAt: number } | null = null;
  const inflightAudioJobs = new Map<
    string,
    Promise<{
      filePath: string;
      mimeType: string;
      meta: {
        judul_audio: string;
        channel_audio: string;
        durasi_ms: number;
        sumber_audio: string;
      };
    }>
  >();

  async function getSoundCloudClientId(): Promise<string> {
    if (cachedScClientId && cachedScClientId.expiresAt > Date.now()) {
      return cachedScClientId.value;
    }
    const discoverRes = await fetch('https://soundcloud.com/discover', {
      headers: { 'User-Agent': SCRAPE_UA },
    });
    if (!discoverRes.ok) {
      throw new Error(`SoundCloud discover HTTP ${discoverRes.status}`);
    }
    const html = await discoverRes.text();
    const scriptMatches = Array.from(
      html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
    ).map((m) => m[1]);

    for (const scriptUrl of scriptMatches.reverse()) {
      const jsRes = await fetch(scriptUrl, {
        headers: { 'User-Agent': SCRAPE_UA },
      });
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const cidMatch =
        js.match(/client_id:"([a-zA-Z0-9]{24,40})"/) ??
        js.match(/client_id=([a-zA-Z0-9]{24,40})/);
      if (cidMatch?.[1]) {
        cachedScClientId = {
          value: cidMatch[1],
          expiresAt: Date.now() + 6 * 3600_000,
        };
        return cidMatch[1];
      }
    }
    throw new Error('Gagal mengekstrak client_id SoundCloud.');
  }

  interface ResolvedAudioSource {
    streamUrl: string;
    isHls: boolean;
    sourceMime: string;
    judulAudio: string;
    channelAudio: string;
    durasiMs: number;
    permalinkUrl: string;
  }

  async function resolveSoundCloudAudio(
    searchQuery: string,
    targetDurationMs = 0
  ): Promise<ResolvedAudioSource | null> {
    const clientId = await getSoundCloudClientId();
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      searchQuery
    )}&client_id=${encodeURIComponent(clientId)}&limit=12`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': SCRAPE_UA,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      collection?: Array<{
        id?: number;
        title?: string;
        duration?: number;
        full_duration?: number;
        streamable?: boolean;
        policy?: string;
        permalink_url?: string;
        track_authorization?: string;
        user?: { username?: string };
        media?: {
          transcodings?: Array<{
            url?: string;
            snipped?: boolean;
            format?: { protocol?: string; mime_type?: string };
          }>;
        };
      }>;
    };

    const qLower = searchQuery.toLowerCase();
    const qTokens = qLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const badWords = ['slowed', 'reverb', 'nightcore', 'sped up', 'remix', 'karaoke', 'cover', '8d', 'bass'];

    const candidates = (data.collection ?? [])
      .map((item) => {
        const transcodings = (item.media?.transcodings ?? []).filter(
          (t) =>
            Boolean(t.url) &&
            !t.snipped &&
            (t.format?.protocol === 'progressive' || t.format?.protocol === 'hls')
        );
        if (!item.streamable || item.policy === 'BLOCK' || transcodings.length === 0) {
          return null;
        }
        const dur = Number(item.full_duration || item.duration || 0);
        const title = item.title || '';
        const author = item.user?.username || '';
        const combined = `${title} ${author}`.toLowerCase();

        let score = 0;
        for (const tok of qTokens) {
          if (combined.includes(tok)) score += 3;
        }
        if (targetDurationMs > 0 && dur > 0) {
          const diffSec = Math.abs(dur - targetDurationMs) / 1000;
          if (diffSec <= 6) score += 8;
          else if (diffSec <= 15) score += 5;
          else if (diffSec <= 30) score += 2;
          else if (dur < 60_000 && targetDurationMs > 90_000) score -= 12;
        } else if (dur >= 90_000) {
          score += 3;
        }

        for (const bad of badWords) {
          if (combined.includes(bad) && !qLower.includes(bad)) {
            score -= 6;
          }
        }

        const picked =
          transcodings.find(
            (t) => t.format?.protocol === 'progressive' && t.format?.mime_type?.includes('audio/mpeg')
          ) ??
          transcodings.find(
            (t) => t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mp4')
          ) ??
          transcodings.find(
            (t) => t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mpeg')
          ) ??
          transcodings[0];

        return { item, picked, score, dur };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.score - a.score);

    for (const cand of candidates.slice(0, 3)) {
      if (!cand.picked?.url) continue;
      const authParam = cand.item.track_authorization
        ? `&track_authorization=${encodeURIComponent(cand.item.track_authorization)}`
        : '';
      const resolveUrl = `${cand.picked.url}?client_id=${encodeURIComponent(clientId)}${authParam}`;
      const streamInfoRes = await fetch(resolveUrl, {
        headers: { 'User-Agent': SCRAPE_UA, Accept: 'application/json' },
      });
      if (!streamInfoRes.ok) continue;
      const streamInfo = (await streamInfoRes.json()) as { url?: string };
      if (!streamInfo.url) continue;

      return {
        streamUrl: streamInfo.url,
        isHls: cand.picked.format?.protocol === 'hls',
        sourceMime: cand.picked.format?.mime_type || 'audio/mp4',
        judulAudio: cand.item.title || searchQuery,
        channelAudio: cand.item.user?.username || 'Audio Stream',
        durasiMs: cand.dur,
        permalinkUrl: cand.item.permalink_url || '',
      };
    }

    return null;
  }

  function pruneAudioCacheIfNeeded() {
    try {
      const files = fs
        .readdirSync(AUDIO_CACHE_DIR)
        .filter((f) => f.endsWith('.m4a') || f.endsWith('.mp3'))
        .map((f) => {
          const full = path.join(AUDIO_CACHE_DIR, f);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => a.mtime - b.mtime);

      while (files.length > 40) {
        const oldest = files.shift();
        if (oldest) {
          fs.unlinkSync(oldest.full);
          const metaFile = oldest.full.replace(/\.(m4a|mp3)$/, '.json');
          if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
        }
      }
    } catch {
      // Ignore cache prune error
    }
  }

  async function ensureAudioFile(
    cacheKeyRaw: string,
    searchQuery: string,
    targetDurationMs: number,
    format: 'm4a' | 'mp3' = 'm4a'
  ) {
    const cacheHash = crypto
      .createHash('sha1')
      .update(`${cacheKeyRaw}|${searchQuery.toLowerCase()}`)
      .digest('hex')
      .slice(0, 20);
    const jobKey = `${cacheHash}.${format}`;
    const targetPath = path.join(AUDIO_CACHE_DIR, jobKey);
    const metaPath = path.join(AUDIO_CACHE_DIR, `${cacheHash}.json`);
    const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';

    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.size > 16_384) {
        const now = new Date();
        try {
          fs.utimesSync(targetPath, now, now);
        } catch {
          // Ignore touch error
        }
        let meta = {
          judul_audio: searchQuery,
          channel_audio: 'Audio Full Song',
          durasi_ms: targetDurationMs,
          sumber_audio: 'audio-full-stream-cache',
        };
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          } catch {
            // Keep fallback meta
          }
        }
        return { filePath: targetPath, mimeType, meta };
      }
    }

    const existingJob = inflightAudioJobs.get(jobKey);
    if (existingJob) return existingJob;

    const job = (async () => {
      pruneAudioCacheIfNeeded();
      const resolved = await resolveSoundCloudAudio(searchQuery, targetDurationMs);
      if (!resolved) {
        throw new Error('Sumber audio penuh belum tersedia untuk lagu tersebut.');
      }

      const partPath = `${targetPath}.${Date.now()}.part`;
      const isSourceMp3 = resolved.sourceMime.includes('mpeg');

      const ffArgs =
        format === 'mp3'
          ? isSourceMp3 && !resolved.isHls
            ? ['-y', '-loglevel', 'error', '-i', resolved.streamUrl, '-vn', '-c:a', 'copy', '-f', 'mp3', partPath]
            : ['-y', '-loglevel', 'error', '-i', resolved.streamUrl, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', partPath]
          : isSourceMp3
          ? ['-y', '-loglevel', 'error', '-i', resolved.streamUrl, '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-f', 'mp4', partPath]
          : ['-y', '-loglevel', 'error', '-i', resolved.streamUrl, '-vn', '-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', partPath];

      try {
        await execFileAsync('/usr/bin/ffmpeg', ffArgs, { timeout: 25_000 });
        if (!fs.existsSync(partPath) || fs.statSync(partPath).size < 16_384) {
          throw new Error('File audio hasil konversi kosong.');
        }
        fs.renameSync(partPath, targetPath);
      } catch (err) {
        if (fs.existsSync(partPath)) {
          try {
            fs.unlinkSync(partPath);
          } catch {
            // Ignore cleanup
          }
        }
        throw err;
      }

      const meta = {
        judul_audio: resolved.judulAudio,
        channel_audio: resolved.channelAudio,
        durasi_ms: resolved.durasiMs || targetDurationMs,
        sumber_audio: 'audio-full-stream',
      };
      try {
        fs.writeFileSync(metaPath, JSON.stringify(meta));
      } catch {
        // Ignore meta write failure
      }

      return { filePath: targetPath, mimeType, meta };
    })();

    inflightAudioJobs.set(jobKey, job);
    try {
      return await job;
    } finally {
      inflightAudioJobs.delete(jobKey);
    }
  }

  function streamAudioFileWithRange(
    req: Request,
    res: Response,
    filePath: string,
    mimeType: string,
    downloadName: string
  ) {
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const safeName = downloadName.replace(/[^a-zA-Z0-9_.\- ]/g, '_').slice(0, 80) || 'efemma-audio';
    const ext = mimeType === 'audio/mpeg' ? 'mp3' : 'm4a';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.${ext}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Media-Type', 'audio-only');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : totalSize - 1;
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= totalSize ||
        start > end
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        return res.end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      const rs = fs.createReadStream(filePath, { start, end });
      rs.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      return rs.pipe(res);
    }

    res.status(200);
    res.setHeader('Content-Length', String(totalSize));
    const rs = fs.createReadStream(filePath);
    rs.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
    return rs.pipe(res);
  }

  async function resolveSpotifyTrackByScrape(
    trackId: string,
    queryText: string
  ): Promise<NormalizedSpotifyTrack | null> {
    if (trackId) {
      const cleanId = trackId.replace(/^spotify:track:/, '').trim();
      const pf = await callSpotifyPathfinder<{ data?: { trackUnion?: Record<string, unknown> } }>(
        'getTrack',
        { uri: `spotify:track:${cleanId}` }
      );
      if (pf.data?.trackUnion) {
        return normalizePfTrack(pf.data.trackUnion);
      }
      return null;
    }

    const sd = await callSpotifyPathfinder<{
      data?: { searchV2?: { tracksV2?: { items?: Array<{ item?: { data?: Record<string, unknown> } }> } } };
    }>('searchDesktop', {
      searchTerm: queryText,
      offset: 0,
      limit: 5,
      numberOfTopResults: 3,
      includeAudiobooks: false,
      includeArtistHasConcertsField: false,
      includePreReleases: true,
      includeLocalConcertsField: false,
      includeAuthors: false,
    });
    const first = sd.data?.searchV2?.tracksV2?.items?.[0]?.item?.data;
    return normalizePfTrack(first);
  }

  function sendSpotifyScrapeError(res: Response, err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal melakukan scrape ke web Spotify.';
    return res.status(502).json({
      sukses: false,
      kesalahan: { kode: 'SPOTIFY_SCRAPE_ERROR', pesan: msg },
    });
  }

  // 8. GET /api/v1/spotify/trending
  app.get('/api/v1/spotify/trending', async (req: Request, res: Response) => {
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 15) || 15));
    try {
      const [homeData, topChartPl] = await Promise.all([
        callSpotifyPathfinder<{
          data?: {
            home?: {
              sectionContainer?: {
                sections?: {
                  items?: Array<{
                    data?: { title?: { transformedLabel?: string } };
                    sectionItems?: { items?: Array<Record<string, unknown>> };
                  }>;
                };
              };
            };
          };
        }>('home', {
          timeZone: 'Asia/Jakarta',
          sp_t: '',
          facet: '',
          sectionItemsLimit: Math.max(20, limit),
          homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
          includeHomeChapterVideoCards: false,
          includeEpisodeContentRatingsV2: false,
        }),
        callSpotifyPathfinder<{
          data?: {
            playlistV2?: Record<string, unknown> & {
              content?: { items?: Array<{ itemV2?: { data?: Record<string, unknown> } }> };
            };
          };
        }>('fetchPlaylist', {
          uri: `spotify:playlist:${market === 'ID' ? '37i9dQZEVXbObFQZ3JLcXt' : '37i9dQZEVXbMDoHDwVN2tF'}`,
          offset: 0,
          limit,
          enableWatchFeedEntrypoint: false,
        }).catch(() => null),
      ]);

      const sections = homeData.data?.home?.sectionContainer?.sections?.items ?? [];
      const tracks: NormalizedSpotifyTrack[] = [];
      const playlists: Array<ReturnType<typeof normalizePfPlaylist>> = [];

      if (topChartPl?.data?.playlistV2) {
        const mappedPl = normalizePfPlaylist(topChartPl.data.playlistV2);
        if (mappedPl) playlists.push(mappedPl);
        const plItems = topChartPl.data.playlistV2.content?.items ?? [];
        for (const it of plItems) {
          const nt = normalizePfTrack(it.itemV2?.data);
          if (nt) tracks.push(nt);
        }
      }

      for (const sec of sections) {
        const title = (sec.data?.title?.transformedLabel || '').toLowerCase();
        const items = sec.sectionItems?.items ?? [];
        for (const rawItem of items) {
          const unwrapped = unwrapSectionContent(rawItem);
          if (!unwrapped) continue;
          if (unwrapped.typename === 'Track' || title.includes('trending')) {
            const nt = normalizePfTrack(unwrapped.data);
            if (nt && !tracks.some((x) => x.id === nt.id)) tracks.push(nt);
          }
          if (unwrapped.typename === 'Playlist') {
            const np = normalizePfPlaylist(unwrapped.data);
            if (np && !playlists.some((x) => x?.id === np.id)) playlists.push(np);
          }
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-trending',
        sumber_data: 'spotify-web-scrape',
        market,
        tracks: tracks.slice(0, limit),
        playlists: playlists.filter(Boolean).slice(0, 12),
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 9. GET /api/v1/spotify/popular
  app.get('/api/v1/spotify/popular', async (req: Request, res: Response) => {
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const rawType = String(req.query.type || 'track').trim().toLowerCase();
    const type = rawType === 'artist' ? 'artist' : rawType === 'album' ? 'album' : 'track';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 15) || 15));
    try {
      const [homeData, topHits] = await Promise.all([
        callSpotifyPathfinder<{
          data?: {
            home?: {
              sectionContainer?: {
                sections?: {
                  items?: Array<{
                    data?: { title?: { transformedLabel?: string } };
                    sectionItems?: { items?: Array<Record<string, unknown>> };
                  }>;
                };
              };
            };
          };
        }>('home', {
          timeZone: 'Asia/Jakarta',
          sp_t: '',
          facet: '',
          sectionItemsLimit: Math.max(20, limit),
          homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
          includeHomeChapterVideoCards: false,
          includeEpisodeContentRatingsV2: false,
        }),
        type === 'track'
          ? callSpotifyPathfinder<{
              data?: {
                playlistV2?: { content?: { items?: Array<{ itemV2?: { data?: Record<string, unknown> } }> } };
              };
            }>('fetchPlaylist', {
              uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
              offset: 0,
              limit,
              enableWatchFeedEntrypoint: false,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const sections = homeData.data?.home?.sectionContainer?.sections?.items ?? [];
      const items: unknown[] = [];

      if (type === 'track' && topHits?.data?.playlistV2?.content?.items) {
        for (const it of topHits.data.playlistV2.content.items) {
          const nt = normalizePfTrack(it.itemV2?.data);
          if (nt) items.push(nt);
        }
      }

      for (const sec of sections) {
        for (const rawItem of sec.sectionItems?.items ?? []) {
          const u = unwrapSectionContent(rawItem);
          if (!u) continue;
          if (type === 'artist' && u.typename === 'Artist') {
            const na = normalizePfArtist(u.data);
            if (na) items.push(na);
          } else if (type === 'album' && u.typename === 'Album') {
            const nal = normalizePfAlbum(u.data);
            if (nal) items.push(nal);
          } else if (type === 'track' && u.typename === 'Track') {
            const nt = normalizePfTrack(u.data);
            if (nt && !items.some((x) => (x as NormalizedSpotifyTrack).id === nt.id)) items.push(nt);
          }
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-popular',
        sumber_data: 'spotify-web-scrape',
        market,
        type,
        total: Math.min(limit, items.length),
        items: items.slice(0, limit),
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 10. GET /api/v1/spotify/new-releases
  app.get('/api/v1/spotify/new-releases', async (req: Request, res: Response) => {
    const country = String(req.query.country || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
    try {
      const [bp, nmf] = await Promise.all([
        callSpotifyPathfinder<{
          data?: {
            browse?: {
              sections?: {
                items?: Array<{
                  sectionItems?: { items?: Array<Record<string, unknown>> };
                }>;
              };
            };
          };
        }>('browsePage', {
          pagePagination: { offset: 0, limit: 10 },
          sectionPagination: { offset: 0, limit: Math.max(20, limit) },
          uri: 'spotify:page:0JQ5DAqbMKFz6FAsUtgAab',
          browseEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
          includeEpisodeContentRatingsV2: false,
        }),
        callSpotifyPathfinder<{
          data?: {
            playlistV2?: Record<string, unknown> & {
              content?: { items?: Array<{ itemV2?: { data?: Record<string, unknown> } }> };
            };
          };
        }>('fetchPlaylist', {
          uri: 'spotify:playlist:37i9dQZF1DX4JAvHpjipBk',
          offset: 0,
          limit: 15,
          enableWatchFeedEntrypoint: false,
        }).catch(() => null),
      ]);

      const albums: Array<ReturnType<typeof normalizePfAlbum>> = [];
      const playlists: Array<ReturnType<typeof normalizePfPlaylist>> = [];
      const tracks: NormalizedSpotifyTrack[] = [];

      for (const sec of bp.data?.browse?.sections?.items ?? []) {
        for (const rawItem of sec.sectionItems?.items ?? []) {
          const u = unwrapSectionContent(rawItem);
          if (!u) continue;
          if (u.typename === 'Album') {
            const nal = normalizePfAlbum(u.data);
            if (nal) albums.push(nal);
          } else if (u.typename === 'Playlist') {
            const np = normalizePfPlaylist(u.data);
            if (np) playlists.push(np);
          }
        }
      }

      if (nmf?.data?.playlistV2?.content?.items) {
        for (const it of nmf.data.playlistV2.content.items) {
          const nt = normalizePfTrack(it.itemV2?.data);
          if (nt) tracks.push(nt);
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-new-releases',
        sumber_data: 'spotify-web-scrape',
        country,
        total: Math.min(limit, albums.length),
        albums: albums.slice(0, limit),
        playlists,
        tracks: tracks.slice(0, 15),
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 11. GET /api/v1/spotify/genres
  app.get('/api/v1/spotify/genres', async (req: Request, res: Response) => {
    const country = String(req.query.country || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const genre = String(req.query.genre || '').trim();
    const limit = Math.min(65, Math.max(1, Number(req.query.limit ?? 30) || 30));
    try {
      const ba = await callSpotifyPathfinder<{
        data?: {
          browseStart?: {
            sections?: {
              items?: Array<{
                sectionItems?: {
                  items?: Array<{
                    uri?: string;
                    content?: {
                      data?: {
                        data?: {
                          cardRepresentation?: {
                            title?: { transformedLabel?: string };
                            artwork?: { sources?: Array<{ url?: string }> };
                            backgroundColor?: { hex?: string };
                          };
                        };
                      };
                    };
                  }>;
                };
              }>;
            };
          };
        };
      }>('browseAll', {
        pagePagination: { offset: 0, limit: 10 },
        sectionPagination: { offset: 0, limit: 80 },
        browseEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
      });

      const allCats = (ba.data?.browseStart?.sections?.items?.[0]?.sectionItems?.items ?? [])
        .map((c) => {
          const rep = c.content?.data?.data?.cardRepresentation;
          const nama = rep?.title?.transformedLabel || '';
          const uri = c.uri || '';
          const id = extractIdFromUri(uri);
          return {
            id,
            uri,
            nama,
            ikon: rep?.artwork?.sources?.[0]?.url ?? null,
            warna_latar: rep?.backgroundColor?.hex ?? null,
          };
        })
        .filter((c) => Boolean(c.nama && c.uri.startsWith('spotify:page:')));

      let playlistsByGenre: Array<ReturnType<typeof normalizePfPlaylist>> = [];
      let tracksByGenre: NormalizedSpotifyTrack[] = [];

      if (genre) {
        const lowerGenre = genre.toLowerCase();
        const matchedCat = allCats.find(
          (c) => c.id.toLowerCase() === lowerGenre || c.nama.toLowerCase().includes(lowerGenre)
        );
        const [genrePage, genreSearch] = await Promise.all([
          matchedCat
            ? callSpotifyPathfinder<{
                data?: {
                  browse?: {
                    sections?: { items?: Array<{ sectionItems?: { items?: Array<Record<string, unknown>> } }> };
                  };
                };
              }>('browsePage', {
                pagePagination: { offset: 0, limit: 5 },
                sectionPagination: { offset: 0, limit: 15 },
                uri: matchedCat.uri,
                browseEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
                includeEpisodeContentRatingsV2: false,
              }).catch(() => null)
            : Promise.resolve(null),
          callSpotifyPathfinder<{
            data?: {
              searchV2?: {
                tracksV2?: { items?: Array<{ item?: { data?: Record<string, unknown> } }> };
                playlists?: { items?: Array<{ data?: Record<string, unknown> }> };
              };
            };
          }>('searchDesktop', {
            searchTerm: `genre:${genre}`,
            offset: 0,
            limit: 12,
            numberOfTopResults: 4,
            includeAudiobooks: false,
            includeArtistHasConcertsField: false,
            includePreReleases: true,
            includeLocalConcertsField: false,
            includeAuthors: false,
          }).catch(() => null),
        ]);

        if (genrePage?.data?.browse?.sections?.items) {
          for (const sec of genrePage.data.browse.sections.items) {
            for (const rawItem of sec.sectionItems?.items ?? []) {
              const u = unwrapSectionContent(rawItem);
              if (u?.typename === 'Playlist') {
                const np = normalizePfPlaylist(u.data);
                if (np) playlistsByGenre.push(np);
              } else if (u?.typename === 'Track') {
                const nt = normalizePfTrack(u.data);
                if (nt) tracksByGenre.push(nt);
              }
            }
          }
        }
        if (genreSearch?.data?.searchV2) {
          for (const it of genreSearch.data.searchV2.tracksV2?.items ?? []) {
            const nt = normalizePfTrack(it.item?.data);
            if (nt && !tracksByGenre.some((x) => x.id === nt.id)) tracksByGenre.push(nt);
          }
          for (const it of genreSearch.data.searchV2.playlists?.items ?? []) {
            const np = normalizePfPlaylist(it.data);
            if (np && !playlistsByGenre.some((x) => x?.id === np.id)) playlistsByGenre.push(np);
          }
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-genres',
        sumber_data: 'spotify-web-scrape',
        country,
        genre_filter: genre || null,
        categories: allCats.slice(0, limit),
        playlists_by_genre: playlistsByGenre.filter(Boolean).slice(0, 15),
        tracks_by_genre: tracksByGenre.slice(0, 15),
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 12. GET /api/v1/spotify/artists
  app.get('/api/v1/spotify/artists', async (req: Request, res: Response) => {
    const id = String(req.query.id || '').trim().replace(/^spotify:artist:/, '');
    const q = String(req.query.q || 'Hindia').trim();
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
    try {
      let artists: Array<ReturnType<typeof normalizePfArtist>> = [];
      let targetArtistId = id;

      if (!targetArtistId) {
        const sd = await callSpotifyPathfinder<{
          data?: { searchV2?: { artists?: { items?: Array<{ data?: Record<string, unknown> }> } } };
        }>('searchDesktop', {
          searchTerm: q,
          offset: 0,
          limit,
          numberOfTopResults: 3,
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
          includeLocalConcertsField: false,
          includeAuthors: false,
        });
        artists = (sd.data?.searchV2?.artists?.items ?? [])
          .map((x) => normalizePfArtist(x.data))
          .filter(Boolean);
        targetArtistId = artists[0]?.id || '';
      }

      let detail: {
        artist: ReturnType<typeof normalizePfArtist>;
        top_tracks: NormalizedSpotifyTrack[];
        albums: Array<ReturnType<typeof normalizePfAlbum>>;
        related_artists: Array<ReturnType<typeof normalizePfArtist>>;
      } | null = null;

      if (targetArtistId) {
        const ao = await callSpotifyPathfinder<{
          data?: {
            artistUnion?: Record<string, unknown> & {
              discography?: {
                topTracks?: { items?: Array<{ track?: Record<string, unknown> }> };
                albums?: { items?: Array<{ releases?: { items?: Array<Record<string, unknown>> } }> };
                singles?: { items?: Array<{ releases?: { items?: Array<Record<string, unknown>> } }> };
              };
              relatedContent?: {
                relatedArtists?: { items?: Array<Record<string, unknown>> };
              };
            };
          };
        }>('queryArtistOverview', {
          uri: `spotify:artist:${targetArtistId}`,
          locale: '',
        });

        const union = ao.data?.artistUnion;
        if (union) {
          const mappedArtist = normalizePfArtist(union);
          if (artists.length === 0 && mappedArtist) artists = [mappedArtist];
          const topTracks = (union.discography?.topTracks?.items ?? [])
            .map((x) => normalizePfTrack(x.track))
            .filter((x): x is NormalizedSpotifyTrack => Boolean(x));
          const albumReleases = [
            ...(union.discography?.albums?.items ?? []).flatMap((g) => g.releases?.items ?? []),
            ...(union.discography?.singles?.items ?? []).flatMap((g) => g.releases?.items ?? []),
          ]
            .map((r) => normalizePfAlbum(r))
            .filter(Boolean);
          const relatedArtists = (union.relatedContent?.relatedArtists?.items ?? [])
            .map((r) => normalizePfArtist(r))
            .filter(Boolean);

          detail = {
            artist: mappedArtist,
            top_tracks: topTracks,
            albums: albumReleases.slice(0, 15),
            related_artists: relatedArtists.slice(0, 8),
          };
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-artists',
        sumber_data: 'spotify-web-scrape',
        market,
        artists,
        detail,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 13. GET /api/v1/spotify/albums
  app.get('/api/v1/spotify/albums', async (req: Request, res: Response) => {
    const id = String(req.query.id || '').trim().replace(/^spotify:album:/, '');
    const q = String(req.query.q || 'Menari Dengan Bayangan').trim();
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
    try {
      let albums: Array<ReturnType<typeof normalizePfAlbum>> = [];
      let targetAlbumId = id;

      if (!targetAlbumId) {
        const sd = await callSpotifyPathfinder<{
          data?: { searchV2?: { albumsV2?: { items?: Array<{ data?: Record<string, unknown> }> } } };
        }>('searchDesktop', {
          searchTerm: q,
          offset: 0,
          limit,
          numberOfTopResults: 3,
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
          includeLocalConcertsField: false,
          includeAuthors: false,
        });
        albums = (sd.data?.searchV2?.albumsV2?.items ?? [])
          .map((x) => normalizePfAlbum(x.data))
          .filter(Boolean);
        targetAlbumId = albums[0]?.id || '';
      }

      let detail: {
        album: ReturnType<typeof normalizePfAlbum> & { label?: string | null };
        tracks: NormalizedSpotifyTrack[];
      } | null = null;

      if (targetAlbumId) {
        const ga = await callSpotifyPathfinder<{
          data?: {
            albumUnion?: Record<string, unknown> & {
              label?: string;
              tracksV2?: { items?: Array<{ track?: Record<string, unknown> }> };
            };
          };
        }>('getAlbum', {
          uri: `spotify:album:${targetAlbumId}`,
          locale: '',
          offset: 0,
          limit: 50,
        });
        const union = ga.data?.albumUnion;
        if (union) {
          const mappedAlbum = normalizePfAlbum({ ...union, id: targetAlbumId, uri: `spotify:album:${targetAlbumId}` });
          if (albums.length === 0 && mappedAlbum) albums = [mappedAlbum];
          const tracks = (union.tracksV2?.items ?? [])
            .map((it) =>
              normalizePfTrack(it.track, {
                id: targetAlbumId,
                name: mappedAlbum?.nama,
                cover: mappedAlbum?.sampul ?? null,
                releaseDate: mappedAlbum?.tanggal_rilis ?? null,
              })
            )
            .filter((x): x is NormalizedSpotifyTrack => Boolean(x));
          if (mappedAlbum) {
            detail = {
              album: { ...mappedAlbum, label: union.label || null },
              tracks,
            };
          }
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-albums',
        sumber_data: 'spotify-web-scrape',
        market,
        albums,
        detail,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 14. GET /api/v1/spotify/playlists
  app.get('/api/v1/spotify/playlists', async (req: Request, res: Response) => {
    const id = String(req.query.id || '').trim().replace(/^spotify:playlist:/, '');
    const q = String(req.query.q || 'Indie Indonesia').trim();
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
    try {
      let playlists: Array<ReturnType<typeof normalizePfPlaylist>> = [];
      let targetPlaylistId = id;

      if (!targetPlaylistId) {
        const sd = await callSpotifyPathfinder<{
          data?: { searchV2?: { playlists?: { items?: Array<{ data?: Record<string, unknown> }> } } };
        }>('searchDesktop', {
          searchTerm: q,
          offset: 0,
          limit,
          numberOfTopResults: 3,
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
          includeLocalConcertsField: false,
          includeAuthors: false,
        });
        playlists = (sd.data?.searchV2?.playlists?.items ?? [])
          .map((x) => normalizePfPlaylist(x.data))
          .filter(Boolean);
        targetPlaylistId = playlists[0]?.id || '';
      }

      let detail: {
        playlist: ReturnType<typeof normalizePfPlaylist>;
        tracks: NormalizedSpotifyTrack[];
      } | null = null;

      if (targetPlaylistId) {
        const fp = await callSpotifyPathfinder<{
          data?: {
            playlistV2?: Record<string, unknown> & {
              content?: { items?: Array<{ itemV2?: { data?: Record<string, unknown> } }> };
            };
          };
        }>('fetchPlaylist', {
          uri: `spotify:playlist:${targetPlaylistId}`,
          offset: 0,
          limit: 30,
          enableWatchFeedEntrypoint: false,
        });
        const pv2 = fp.data?.playlistV2;
        if (pv2) {
          const mappedPl = normalizePfPlaylist({ ...pv2, id: targetPlaylistId, uri: `spotify:playlist:${targetPlaylistId}` });
          if (playlists.length === 0 && mappedPl) playlists = [mappedPl];
          const tracks = (pv2.content?.items ?? [])
            .map((it) => normalizePfTrack(it.itemV2?.data))
            .filter((x): x is NormalizedSpotifyTrack => Boolean(x));
          detail = { playlist: mappedPl, tracks };
        }
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-playlists',
        sumber_data: 'spotify-web-scrape',
        market,
        playlists,
        detail,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 15. GET /api/v1/spotify/mood-activities
  app.get('/api/v1/spotify/mood-activities', async (req: Request, res: Response) => {
    const mood = String(req.query.mood || 'chill').trim();
    const country = String(req.query.country || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 15) || 15));
    try {
      const ba = await callSpotifyPathfinder<{
        data?: {
          browseStart?: {
            sections?: {
              items?: Array<{
                sectionItems?: {
                  items?: Array<{
                    uri?: string;
                    content?: {
                      data?: {
                        data?: {
                          cardRepresentation?: {
                            title?: { transformedLabel?: string };
                            artwork?: { sources?: Array<{ url?: string }> };
                          };
                        };
                      };
                    };
                  }>;
                };
              }>;
            };
          };
        };
      }>('browseAll', {
        pagePagination: { offset: 0, limit: 10 },
        sectionPagination: { offset: 0, limit: 80 },
        browseEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
      });

      const moodKeywords = ['chill', 'mood', 'workout', 'focus', 'party', 'sleep', 'wellness', 'gaming', 'travel', 'love', 'at home', 'summer'];
      const moodCategories = (ba.data?.browseStart?.sections?.items?.[0]?.sectionItems?.items ?? [])
        .map((c) => ({
          id: extractIdFromUri(c.uri),
          uri: c.uri || '',
          nama: c.content?.data?.data?.cardRepresentation?.title?.transformedLabel || '',
          ikon: c.content?.data?.data?.cardRepresentation?.artwork?.sources?.[0]?.url ?? null,
        }))
        .filter(
          (c) =>
            c.nama &&
            c.uri.startsWith('spotify:page:') &&
            moodKeywords.some((k) => c.nama.toLowerCase().includes(k))
        );

      const matchedMood = moodCategories.find((c) => c.nama.toLowerCase().includes(mood.toLowerCase()));

      const [bpMood, sdMood] = await Promise.all([
        matchedMood
          ? callSpotifyPathfinder<{
              data?: {
                browse?: {
                  sections?: { items?: Array<{ sectionItems?: { items?: Array<Record<string, unknown>> } }> };
                };
              };
            }>('browsePage', {
              pagePagination: { offset: 0, limit: 5 },
              sectionPagination: { offset: 0, limit: 15 },
              uri: matchedMood.uri,
              browseEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
              includeEpisodeContentRatingsV2: false,
            }).catch(() => null)
          : Promise.resolve(null),
        callSpotifyPathfinder<{
          data?: {
            searchV2?: {
              playlists?: { items?: Array<{ data?: Record<string, unknown> }> };
              tracksV2?: { items?: Array<{ item?: { data?: Record<string, unknown> } }> };
            };
          };
        }>('searchDesktop', {
          searchTerm: mood,
          offset: 0,
          limit,
          numberOfTopResults: 4,
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
          includeLocalConcertsField: false,
          includeAuthors: false,
        }),
      ]);

      const playlists: Array<ReturnType<typeof normalizePfPlaylist>> = [];
      const tracks: NormalizedSpotifyTrack[] = [];

      for (const sec of bpMood?.data?.browse?.sections?.items ?? []) {
        for (const rawItem of sec.sectionItems?.items ?? []) {
          const u = unwrapSectionContent(rawItem);
          if (u?.typename === 'Playlist') {
            const np = normalizePfPlaylist(u.data);
            if (np) playlists.push(np);
          }
        }
      }

      for (const it of sdMood.data?.searchV2?.playlists?.items ?? []) {
        const np = normalizePfPlaylist(it.data);
        if (np && !playlists.some((x) => x?.id === np.id)) playlists.push(np);
      }

      for (const it of sdMood.data?.searchV2?.tracksV2?.items ?? []) {
        const nt = normalizePfTrack(it.item?.data);
        if (nt) tracks.push(nt);
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-mood-activities',
        sumber_data: 'spotify-web-scrape',
        country,
        mood,
        mood_categories: moodCategories,
        playlists: playlists.filter(Boolean).slice(0, limit),
        tracks: tracks.slice(0, limit),
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 16. GET /api/v1/spotify/podcasts
  app.get('/api/v1/spotify/podcasts', async (req: Request, res: Response) => {
    const id = String(req.query.id || '').trim().replace(/^spotify:show:/, '');
    const q = String(req.query.q || 'Teknologi Indonesia').trim();
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
    try {
      let shows: Array<ReturnType<typeof normalizePfPodcast>> = [];
      let episodes: Array<ReturnType<typeof normalizePfEpisode>> = [];

      if (id) {
        const [meta, eps] = await Promise.all([
          callSpotifyPathfinder<{ data?: { podcastUnionV2?: Record<string, unknown> } }>(
            'queryShowMetadataV2',
            { uri: `spotify:show:${id}` }
          ),
          callSpotifyPathfinder<{
            data?: {
              podcastUnionV2?: {
                episodesV2?: { items?: Array<{ entity?: { data?: Record<string, unknown> } }> };
              };
            };
          }>('queryPodcastEpisodes', {
            uri: `spotify:show:${id}`,
            offset: 0,
            limit,
          }),
        ]);
        if (meta.data?.podcastUnionV2) {
          const ns = normalizePfPodcast({ ...meta.data.podcastUnionV2, id, uri: `spotify:show:${id}` });
          if (ns) shows = [ns];
        }
        episodes = (eps.data?.podcastUnionV2?.episodesV2?.items ?? [])
          .map((x) => normalizePfEpisode(x.entity?.data))
          .filter(Boolean);
      } else {
        const sd = await callSpotifyPathfinder<{
          data?: {
            searchV2?: {
              podcasts?: { items?: Array<{ data?: Record<string, unknown> }> };
              episodes?: { items?: Array<{ data?: Record<string, unknown> }> };
            };
          };
        }>('searchDesktop', {
          searchTerm: q,
          offset: 0,
          limit,
          numberOfTopResults: 4,
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
          includeLocalConcertsField: false,
          includeAuthors: false,
        });
        shows = (sd.data?.searchV2?.podcasts?.items ?? [])
          .map((x) => normalizePfPodcast(x.data))
          .filter(Boolean);
        episodes = (sd.data?.searchV2?.episodes?.items ?? [])
          .map((x) => normalizePfEpisode(x.data))
          .filter(Boolean);
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-podcasts',
        sumber_data: 'spotify-web-scrape',
        market,
        shows,
        episodes,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 17. GET /api/v1/spotify/search
  app.get('/api/v1/spotify/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({
        sukses: false,
        kesalahan: { kode: 'PARAMETER_KOSONG', pesan: 'Parameter query "q" wajib diisi.' },
      });
    }
    const type = String(req.query.type || 'all').trim().toLowerCase();
    const market = String(req.query.market || 'ID').trim().toUpperCase().slice(0, 2) || 'ID';
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
    try {
      const sd = await callSpotifyPathfinder<{
        data?: {
          searchV2?: {
            tracksV2?: { items?: Array<{ item?: { data?: Record<string, unknown> } }> };
            artists?: { items?: Array<{ data?: Record<string, unknown> }> };
            albumsV2?: { items?: Array<{ data?: Record<string, unknown> }> };
            playlists?: { items?: Array<{ data?: Record<string, unknown> }> };
            podcasts?: { items?: Array<{ data?: Record<string, unknown> }> };
            episodes?: { items?: Array<{ data?: Record<string, unknown> }> };
          };
        };
      }>('searchDesktop', {
        searchTerm: q,
        offset: 0,
        limit,
        numberOfTopResults: 5,
        includeAudiobooks: false,
        includeArtistHasConcertsField: false,
        includePreReleases: true,
        includeLocalConcertsField: false,
        includeAuthors: false,
      });

      const sv2 = sd.data?.searchV2;
      const tracks =
        type === 'all' || type === 'track'
          ? (sv2?.tracksV2?.items ?? []).map((x) => normalizePfTrack(x.item?.data)).filter(Boolean)
          : [];
      const artists =
        type === 'all' || type === 'artist'
          ? (sv2?.artists?.items ?? []).map((x) => normalizePfArtist(x.data)).filter(Boolean)
          : [];
      const albums =
        type === 'all' || type === 'album'
          ? (sv2?.albumsV2?.items ?? []).map((x) => normalizePfAlbum(x.data)).filter(Boolean)
          : [];
      const playlists =
        type === 'all' || type === 'playlist'
          ? (sv2?.playlists?.items ?? []).map((x) => normalizePfPlaylist(x.data)).filter(Boolean)
          : [];
      const shows =
        type === 'all' || type === 'podcast'
          ? (sv2?.podcasts?.items ?? []).map((x) => normalizePfPodcast(x.data)).filter(Boolean)
          : [];
      const episodes =
        type === 'all' || type === 'podcast'
          ? (sv2?.episodes?.items ?? []).map((x) => normalizePfEpisode(x.data)).filter(Boolean)
          : [];

      return res.json({
        sukses: true,
        layanan: 'spotify-search',
        sumber_data: 'spotify-web-scrape',
        query: q,
        market,
        tracks,
        artists,
        albums,
        playlists,
        shows,
        episodes,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 18. GET /api/v1/spotify/library
  app.get('/api/v1/spotify/library', async (req: Request, res: Response) => {
    const userId = String(req.query.user_id || 'spotify').trim();
    const bagian = String(req.query.bagian || 'all').trim().toLowerCase();
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 15) || 15));
    const spDc = (req.header('x-spotify-spdc') || String(req.query.sp_dc || '')).trim();

    try {
      const session = await getSpotifyWebSession({ spDcCookie: spDc || undefined });
      const library: Record<string, unknown> = {};
      let spotifyUser: Record<string, unknown> = { id: userId };

      if (spDc) {
        const [libTracks, edPlaylists] = await Promise.all([
          bagian === 'all' || bagian === 'tracks'
            ? callSpotifyPathfinder<{
                data?: { me?: { library?: { tracks?: { items?: Array<{ track?: { data?: Record<string, unknown> } }> } } } };
              }>('fetchLibraryTracks', { offset: 0, limit }, spDc).catch(() => null)
            : Promise.resolve(null),
          bagian === 'all' || bagian === 'playlists'
            ? callSpotifyPathfinder<{
                data?: { me?: { libraryV3?: { items?: Array<{ item?: { data?: Record<string, unknown> } }> } } };
              }>('editablePlaylists', { offset: 0, limit }, spDc).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (libTracks?.data?.me?.library?.tracks?.items) {
          library.tracks = libTracks.data.me.library.tracks.items
            .map((x) => normalizePfTrack(x.track?.data))
            .filter(Boolean);
        }
        if (edPlaylists?.data?.me?.libraryV3?.items) {
          library.playlists = edPlaylists.data.me.libraryV3.items
            .map((x) => normalizePfPlaylist(x.item?.data))
            .filter(Boolean);
        }
      }

      const profRes = await fetch(
        `https://spclient.wg.spotify.com/user-profile-view/v3/profile/${encodeURIComponent(
          userId
        )}?playlist_limit=${limit}&artist_limit=${limit}&episode_limit=${limit}&market=ID`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'client-token': session.clientToken,
            'User-Agent': SCRAPE_UA,
            Accept: 'application/json',
          },
        }
      );

      if (profRes.ok) {
        const pData = (await profRes.json()) as {
          uri?: string;
          name?: string;
          image_url?: string;
          followers_count?: number;
          following_count?: number;
          public_playlists?: Array<{
            uri?: string;
            name?: string;
            image_url?: string;
            followers_count?: number;
            owner_name?: string;
          }>;
          recently_played_artists?: Array<{
            uri?: string;
            name?: string;
            image_url?: string;
            followers_count?: number;
          }>;
        };

        spotifyUser = {
          id: userId,
          uri: pData.uri ?? `spotify:user:${userId}`,
          nama: pData.name ?? userId,
          foto: pData.image_url ?? null,
          pengikut: pData.followers_count ?? null,
          mengikuti: pData.following_count ?? null,
        };

        const pubPlaylists = (pData.public_playlists ?? []).map((pl) => {
          const plId = extractIdFromUri(pl.uri);
          return {
            id: plId,
            uri: pl.uri || '',
            nama: pl.name || '',
            pemilik: pl.owner_name || pData.name || userId,
            pengikut: pl.followers_count ?? null,
            sampul: pl.image_url ?? null,
            spotify_url: plId ? `https://open.spotify.com/playlist/${plId}` : null,
          };
        });

        if ((bagian === 'all' || bagian === 'playlists') && !library.playlists) {
          library.playlists = pubPlaylists;
        }
        if (bagian === 'all' || bagian === 'artists') {
          library.artists = (pData.recently_played_artists ?? []).map((a) => {
            const aid = extractIdFromUri(a.uri);
            return {
              id: aid,
              uri: a.uri || '',
              nama: a.name || '',
              pengikut: a.followers_count ?? null,
              foto: a.image_url ?? null,
              spotify_url: aid ? `https://open.spotify.com/artist/${aid}` : null,
            };
          });
        }

        if ((bagian === 'all' || bagian === 'tracks') && !library.tracks && pubPlaylists[0]?.id) {
          const fp = await callSpotifyPathfinder<{
            data?: {
              playlistV2?: { content?: { items?: Array<{ itemV2?: { data?: Record<string, unknown> } }> } };
            };
          }>('fetchPlaylist', {
            uri: `spotify:playlist:${pubPlaylists[0].id}`,
            offset: 0,
            limit,
            enableWatchFeedEntrypoint: false,
          }).catch(() => null);
          library.tracks = (fp?.data?.playlistV2?.content?.items ?? [])
            .map((it) => normalizePfTrack(it.itemV2?.data))
            .filter(Boolean);
        }
      } else if (!spDc) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'PROFIL_TIDAK_DITEMUKAN',
            pesan: `Profil Library Spotify "${userId}" tidak ditemukan atau bersifat privat.`,
          },
        });
      }

      return res.json({
        sukses: true,
        layanan: 'spotify-library',
        sumber_data: 'spotify-web-scrape',
        spotify_user: spotifyUser,
        library,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 19. GET/POST /api/v1/spotify/play (Audio-Only Full Song via Spotify Web Scrape + Audio Stream)
  async function handleSpotifyPlay(req: Request, res: Response) {
    const body = (req.body || {}) as {
      track_id?: string;
      query?: string;
      q?: string;
      format?: string;
    };
    const rawTrackInput = String(body.track_id || req.query.track_id || '').trim();
    const trackIdMatch = rawTrackInput.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
    const trackId = trackIdMatch ? trackIdMatch[1] : rawTrackInput.replace(/^spotify:track:/, '');
    const queryText = String(body.query || body.q || req.query.query || req.query.q || '').trim();
    const rawFormat = String(body.format || req.query.format || 'json').trim().toLowerCase();

    if (!trackId && !queryText) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'PARAMETER_KOSONG',
          pesan: 'Isi "track_id" atau "query" lagu Spotify yang ingin diputar penuh (audio-only).',
        },
      });
    }

    try {
      const track = await resolveSpotifyTrackByScrape(trackId, queryText);
      if (!track) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'LAGU_TIDAK_DITEMUKAN',
            pesan: 'Lagu tidak ditemukan di web Spotify.',
          },
        });
      }

      const audioSearchQuery = `${track.artis[0] || ''} ${track.judul}`.trim();

      if (rawFormat === 'audio' || rawFormat === 'mp3' || rawFormat === 'm4a') {
        const audioFormat: 'm4a' | 'mp3' = rawFormat === 'mp3' ? 'mp3' : 'm4a';
        const ensured = await ensureAudioFile(
          track.id,
          audioSearchQuery,
          track.durasi_ms,
          audioFormat
        );
        return streamAudioFileWithRange(
          req,
          res,
          ensured.filePath,
          ensured.mimeType,
          `${track.artis[0] || 'Efemma'} - ${track.judul}`
        );
      }

      const urls = buildSignedAudioUrls(
        req,
        track.id,
        audioSearchQuery,
        track.durasi_ms,
        '/api/v1/spotify/play'
      );

      const [scMeta, ytResults] = await Promise.all([
        resolveSoundCloudAudio(audioSearchQuery, track.durasi_ms).catch(() => null),
        scrapeYouTubeVideos(`${audioSearchQuery} official audio`).catch(() => []),
      ]);

      if (!scMeta && ytResults.length === 0) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'AUDIO_TIDAK_DITEMUKAN',
            pesan: 'Sumber audio penuh untuk lagu tersebut belum ditemukan.',
          },
          track,
        });
      }

      if (scMeta) {
        // Warm cache in background so immediate playback or server GET stream_url responds instantly
        void ensureAudioFile(track.id, audioSearchQuery, track.durasi_ms, 'm4a').catch(() => {});
      }

      const primaryYt = ytResults[0] ?? null;
      return res.json({
        sukses: true,
        layanan: 'spotify-play',
        sumber_data: 'spotify-web-scrape+audio-stream',
        mode_pemutaran: 'audio-only-full-song',
        tipe_media: 'audio/mp4',
        is_full_song: true,
        audio: scMeta
          ? {
              stream_url: urls.stream_url,
              mp3_stream_url: urls.mp3_stream_url,
              relative_stream_url: urls.relative_stream_url,
              relative_mp3_stream_url: urls.relative_mp3_stream_url,
              mime_type: 'audio/mp4',
              durasi_ms: scMeta.durasiMs || track.durasi_ms,
              sumber_audio: 'audio-full-stream',
              judul_audio: scMeta.judulAudio,
              channel_audio: scMeta.channelAudio,
            }
          : {
              stream_url: null,
              mp3_stream_url: null,
              relative_stream_url: null,
              relative_mp3_stream_url: null,
              mime_type: 'audio/youtube-hidden',
              durasi_ms: track.durasi_ms,
              sumber_audio: 'youtube-audio-engine',
              judul_audio: primaryYt?.judul_youtube || track.judul,
              channel_audio: primaryYt?.channel || track.artis[0] || '',
            },
        track,
        youtube: primaryYt
          ? {
              video_id: primaryYt.video_id,
              judul_audio: primaryYt.judul_youtube,
              channel: primaryYt.channel,
              durasi_text: primaryYt.durasi_text,
              audio_url: scMeta ? urls.stream_url : null,
            }
          : null,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  }

  app.get('/api/v1/spotify/play', handleSpotifyPlay);
  app.post('/api/v1/spotify/play', handleSpotifyPlay);

  // 19b. Helpers & Endpoint: GET /api/v1/spotify/podcast-play (Video or Audio Podcast depending on Spotify source)
  interface ScrapedPodcastEpisodeMeta {
    id: string;
    uri: string;
    judul: string;
    deskripsi: string;
    durasi_ms: number;
    durasi_format: string;
    tanggal_rilis: string | null;
    sampul: string | null;
    spotify_url: string;
    show_id: string | null;
    show_nama: string;
    show_penerbit: string | null;
    show_sampul: string | null;
    is_video_podcast: boolean;
    jenis_media: 'video' | 'audio';
    spotify_preview_audio: string | null;
    spotify_preview_video: string | null;
  }

  function decodeXmlEntities(input: string): string {
    return input
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .trim();
  }

  async function scrapeSpotifyEmbedEpisode(
    episodeId: string
  ): Promise<ScrapedPodcastEpisodeMeta | null> {
    const cleanId = episodeId.trim();
    if (!cleanId) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`https://open.spotify.com/embed/episode/${encodeURIComponent(cleanId)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': SCRAPE_UA, Accept: 'text/html' },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match?.[1]) return null;
      const nextData = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            state?: {
              data?: {
                entity?: {
                  id?: string;
                  uri?: string;
                  name?: string;
                  title?: string;
                  subtitle?: string;
                  description?: string;
                  duration?: number;
                  hasVideo?: boolean;
                  isVideo?: boolean;
                  releaseDate?: { isoString?: string };
                  coverArt?: { sources?: Array<{ url?: string; width?: number }> };
                  visualIdentity?: { image?: Array<{ url?: string }> };
                  relatedEntityUri?: string;
                  audioPreview?: { url?: string };
                  videoPreview?: { url?: string };
                  videoThumbnailImage?: unknown;
                };
              };
            };
          };
        };
      };
      const entity = nextData.props?.pageProps?.state?.data?.entity;
      if (!entity) return null;
      const judul = String(entity.name || entity.title || '').trim();
      if (!judul) return null;
      const durMs = Number(entity.duration || 0);
      const sources = entity.coverArt?.sources ?? [];
      const cover =
        sources[sources.length - 1]?.url ||
        sources[0]?.url ||
        entity.visualIdentity?.image?.[0]?.url ||
        null;
      const relatedShowId = entity.relatedEntityUri
        ? extractIdFromUri(entity.relatedEntityUri)
        : null;
      const hasVideo = Boolean(
        entity.hasVideo ||
          entity.isVideo ||
          entity.videoPreview?.url ||
          entity.videoThumbnailImage
      );
      return {
        id: cleanId,
        uri: entity.uri || `spotify:episode:${cleanId}`,
        judul,
        deskripsi: String(entity.description || ''),
        durasi_ms: durMs,
        durasi_format: formatDurationMs(durMs),
        tanggal_rilis: entity.releaseDate?.isoString?.slice(0, 10) || null,
        sampul: cover,
        spotify_url: `https://open.spotify.com/episode/${cleanId}`,
        show_id: relatedShowId,
        show_nama: String(entity.subtitle || 'Podcast Spotify'),
        show_penerbit: null,
        show_sampul: cover,
        is_video_podcast: hasVideo,
        jenis_media: hasVideo ? 'video' : 'audio',
        spotify_preview_audio: entity.audioPreview?.url || null,
        spotify_preview_video: entity.videoPreview?.url || null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function scrapeSpotifyEmbedShowLatest(
    showId: string
  ): Promise<ScrapedPodcastEpisodeMeta | null> {
    const cleanId = showId.trim();
    if (!cleanId) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`https://open.spotify.com/embed/show/${encodeURIComponent(cleanId)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': SCRAPE_UA, Accept: 'text/html' },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match?.[1]) return null;
      const nextData = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            state?: {
              data?: {
                entity?: {
                  id?: string;
                  uri?: string;
                  name?: string;
                  title?: string;
                  subtitle?: string;
                  description?: string;
                  duration?: number;
                  hasVideo?: boolean;
                  releaseDate?: { isoString?: string };
                  coverArt?: { sources?: Array<{ url?: string }> };
                  visualIdentity?: { image?: Array<{ url?: string }> };
                  relatedEntityUri?: string;
                  audioPreview?: { url?: string };
                  videoPreview?: { url?: string };
                };
              };
            };
          };
        };
      };
      const entity = nextData.props?.pageProps?.state?.data?.entity;
      if (!entity?.id || !entity?.name) return null;
      const epId = String(entity.id).trim();
      const durMs = Number(entity.duration || 0);
      const sources = entity.coverArt?.sources ?? [];
      const cover =
        sources[sources.length - 1]?.url ||
        sources[0]?.url ||
        entity.visualIdentity?.image?.[0]?.url ||
        null;
      const hasVideo = Boolean(entity.hasVideo || entity.videoPreview?.url);
      return {
        id: epId,
        uri: entity.uri || `spotify:episode:${epId}`,
        judul: String(entity.name || entity.title),
        deskripsi: String(entity.description || ''),
        durasi_ms: durMs,
        durasi_format: formatDurationMs(durMs),
        tanggal_rilis: entity.releaseDate?.isoString?.slice(0, 10) || null,
        sampul: cover,
        spotify_url: `https://open.spotify.com/episode/${epId}`,
        show_id: cleanId,
        show_nama: String(entity.subtitle || 'Podcast Spotify'),
        show_penerbit: null,
        show_sampul: cover,
        is_video_podcast: hasVideo,
        jenis_media: hasVideo ? 'video' : 'audio',
        spotify_preview_audio: entity.audioPreview?.url || null,
        spotify_preview_video: entity.videoPreview?.url || null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveSpotifyPodcastEpisode(
    rawEpisodeId: string,
    rawShowId: string,
    queryText: string
  ): Promise<ScrapedPodcastEpisodeMeta | null> {
    const epMatch = rawEpisodeId.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/);
    const episodeId = (epMatch ? epMatch[1] : rawEpisodeId)
      .replace(/^spotify:episode:/, '')
      .split('?')[0]
      .trim();

    const showMatch = rawShowId.match(/open\.spotify\.com\/show\/([a-zA-Z0-9]+)/);
    const showId = (showMatch ? showMatch[1] : rawShowId)
      .replace(/^spotify:show:/, '')
      .split('?')[0]
      .trim();

    if (episodeId) {
      const embedMeta = await scrapeSpotifyEmbedEpisode(episodeId);
      if (embedMeta) return embedMeta;

      const pfEp = await callSpotifyPathfinder<{
        data?: { episodeUnionV2?: Record<string, unknown> };
      }>('getEpisodeOrChapter', { uri: `spotify:episode:${episodeId}` }).catch(() => null);
      const normEp = normalizePfEpisode(pfEp?.data?.episodeUnionV2);
      if (normEp) {
        const hasVid = normEp.jenis_media === 'video';
        return {
          id: normEp.id,
          uri: normEp.uri,
          judul: normEp.judul,
          deskripsi: normEp.deskripsi,
          durasi_ms: normEp.durasi_ms,
          durasi_format: normEp.durasi_format,
          tanggal_rilis: normEp.tanggal_rilis,
          sampul: normEp.sampul,
          spotify_url: normEp.spotify_url,
          show_id: normEp.show_id,
          show_nama: normEp.show_nama || 'Podcast Spotify',
          show_penerbit: null,
          show_sampul: normEp.sampul,
          is_video_podcast: hasVid,
          jenis_media: hasVid ? 'video' : 'audio',
          spotify_preview_audio: null,
          spotify_preview_video: null,
        };
      }
    }

    if (showId) {
      const [meta, eps] = await Promise.all([
        callSpotifyPathfinder<{ data?: { podcastUnionV2?: Record<string, unknown> } }>(
          'queryShowMetadataV2',
          { uri: `spotify:show:${showId}` }
        ).catch(() => null),
        callSpotifyPathfinder<{
          data?: {
            podcastUnionV2?: {
              episodesV2?: { items?: Array<{ entity?: { data?: Record<string, unknown> } }> };
            };
          };
        }>('queryPodcastEpisodes', {
          uri: `spotify:show:${showId}`,
          offset: 0,
          limit: 10,
        }).catch(() => null),
      ]);

      const showInfo = meta?.data?.podcastUnionV2
        ? normalizePfPodcast({ ...meta.data.podcastUnionV2, id: showId, uri: `spotify:show:${showId}` })
        : null;
      const episodeList = (eps?.data?.podcastUnionV2?.episodesV2?.items ?? [])
        .map((x) => normalizePfEpisode(x.entity?.data))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const qLower = queryText.toLowerCase();
      const pickedEp =
        (qLower
          ? episodeList.find((ep) => ep.judul.toLowerCase().includes(qLower))
          : undefined) ?? episodeList[0];

      if (!pickedEp) {
        return await scrapeSpotifyEmbedShowLatest(showId);
      }

      const embedExtra = await scrapeSpotifyEmbedEpisode(pickedEp.id).catch(() => null);
      const isVideo = Boolean(embedExtra?.is_video_podcast || pickedEp.jenis_media === 'video');
      return {
        id: pickedEp.id,
        uri: pickedEp.uri,
        judul: pickedEp.judul,
        deskripsi: pickedEp.deskripsi || embedExtra?.deskripsi || '',
        durasi_ms: pickedEp.durasi_ms || embedExtra?.durasi_ms || 0,
        durasi_format: pickedEp.durasi_format || embedExtra?.durasi_format || '00:00',
        tanggal_rilis: pickedEp.tanggal_rilis || embedExtra?.tanggal_rilis || null,
        sampul: pickedEp.sampul || showInfo?.sampul || embedExtra?.sampul || null,
        spotify_url: pickedEp.spotify_url,
        show_id: showId,
        show_nama: showInfo?.nama || pickedEp.show_nama || embedExtra?.show_nama || 'Podcast Spotify',
        show_penerbit: showInfo?.penerbit ?? null,
        show_sampul: showInfo?.sampul ?? pickedEp.sampul ?? null,
        is_video_podcast: isVideo,
        jenis_media: isVideo ? 'video' : 'audio',
        spotify_preview_audio: embedExtra?.spotify_preview_audio ?? null,
        spotify_preview_video: embedExtra?.spotify_preview_video ?? null,
      };
    }

    if (queryText) {
      const sd = await callSpotifyPathfinder<{
        data?: {
          searchV2?: {
            podcasts?: { items?: Array<{ data?: Record<string, unknown> }> };
            episodes?: { items?: Array<{ data?: Record<string, unknown> }> };
          };
        };
      }>('searchDesktop', {
        searchTerm: queryText,
        offset: 0,
        limit: 8,
        numberOfTopResults: 4,
        includeAudiobooks: false,
        includeArtistHasConcertsField: false,
        includePreReleases: true,
        includeLocalConcertsField: false,
        includeAuthors: false,
      });

      const epCandidates = (sd.data?.searchV2?.episodes?.items ?? [])
        .map((x) => normalizePfEpisode(x.data))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const showCandidates = (sd.data?.searchV2?.podcasts?.items ?? [])
        .map((x) => normalizePfPodcast(x.data))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const topEp = epCandidates[0];
      const topShow = showCandidates[0];

      // Compare whether user's query strongly refers to the podcast show itself (e.g., "Close The Door Podcast")
      const cleanQueryForShow = queryText.replace(/\bpodcast\b/gi, '').trim() || queryText;
      const showMatchScore = topShow ? scoreTitleTokenMatch(topShow.nama, cleanQueryForShow) : 0;
      const epMatchScore = topEp
        ? Math.max(
            scoreTitleTokenMatch(topEp.judul, queryText),
            scoreTitleTokenMatch(topEp.show_nama || '', cleanQueryForShow)
          )
        : 0;

      if (topShow?.id && (showMatchScore >= 0.65 || !topEp || showMatchScore > epMatchScore)) {
        const showResolved = await resolveSpotifyPodcastEpisode('', topShow.id, cleanQueryForShow).catch(
          () => null
        );
        if (showResolved) return showResolved;
      }

      if (topEp) {
        const embedExtra = await scrapeSpotifyEmbedEpisode(topEp.id).catch(() => null);
        const isVideo = Boolean(embedExtra?.is_video_podcast || topEp.jenis_media === 'video');
        return {
          id: topEp.id,
          uri: topEp.uri,
          judul: topEp.judul,
          deskripsi: topEp.deskripsi || embedExtra?.deskripsi || '',
          durasi_ms: topEp.durasi_ms || embedExtra?.durasi_ms || 0,
          durasi_format: topEp.durasi_format || embedExtra?.durasi_format || '00:00',
          tanggal_rilis: topEp.tanggal_rilis || embedExtra?.tanggal_rilis || null,
          sampul: topEp.sampul || embedExtra?.sampul || topShow?.sampul || null,
          spotify_url: topEp.spotify_url,
          show_id: topEp.show_id || embedExtra?.show_id || topShow?.id || null,
          show_nama:
            topEp.show_nama ||
            embedExtra?.show_nama ||
            topShow?.nama ||
            'Podcast Spotify',
          show_penerbit: topShow?.penerbit ?? null,
          show_sampul: embedExtra?.show_sampul || topShow?.sampul || topEp.sampul || null,
          is_video_podcast: isVideo,
          jenis_media: isVideo ? 'video' : 'audio',
          spotify_preview_audio: embedExtra?.spotify_preview_audio ?? null,
          spotify_preview_video: embedExtra?.spotify_preview_video ?? null,
        };
      }

      if (topShow?.id) {
        return resolveSpotifyPodcastEpisode('', topShow.id, queryText);
      }
    }

    return null;
  }

  interface ResolvedPodcastAudio {
    sourceUrl: string | null;
    mimeType: string;
    sourceLabel: string;
    durasiMs: number;
    judulAudio: string;
    channelAudio: string;
    isDirectHttpAudio: boolean;
  }

  function scoreTitleTokenMatch(candidateTitle: string, targetTitle: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2);
    const targetTokens = normalize(targetTitle);
    if (targetTokens.length === 0) return 0;
    const candLower = candidateTitle.toLowerCase();
    let hits = 0;
    for (const tok of targetTokens) {
      if (candLower.includes(tok)) hits += 1;
    }
    return hits / targetTokens.length;
  }

  async function resolvePodcastAudioUrl(
    showName: string,
    episodeTitle: string,
    durationMs: number,
    spotifyPreviewUrl: string | null
  ): Promise<ResolvedPodcastAudio | null> {
    const cleanShow = showName && showName !== 'Podcast Spotify' ? showName : '';
    const combinedTerm = `${cleanShow} ${episodeTitle}`.trim();

    // 1. Direct iTunes Podcast Episode lookup (key-free public RSS/episode directory)
    try {
      const epSearchUrl = `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&term=${encodeURIComponent(
        combinedTerm
      )}&limit=10`;
      const epRes = await fetchJsonWithTimeout<{
        results?: Array<{
          trackName?: string;
          collectionName?: string;
          episodeUrl?: string;
          episodeFileExtension?: string;
          trackTimeMillis?: number;
        }>;
      }>(epSearchUrl, 5000);

      const bestEp = (epRes.results ?? [])
        .filter((r) => Boolean(r.episodeUrl && /^https?:\/\//i.test(r.episodeUrl)))
        .map((r) => {
          const epScore = scoreTitleTokenMatch(r.trackName || '', episodeTitle);
          const showScore = cleanShow
            ? scoreTitleTokenMatch(r.collectionName || '', cleanShow)
            : 0.3;
          return { r, score: epScore * 3 + showScore };
        })
        .sort((a, b) => b.score - a.score)[0];

      if (bestEp && bestEp.score >= 0.9 && bestEp.r.episodeUrl) {
        const ext = (bestEp.r.episodeFileExtension || '').toLowerCase();
        const mime = ext === 'm4a' || bestEp.r.episodeUrl.includes('.m4a') ? 'audio/mp4' : 'audio/mpeg';
        return {
          sourceUrl: bestEp.r.episodeUrl,
          mimeType: mime,
          sourceLabel: 'podcast-rss-full-episode',
          durasiMs: bestEp.r.trackTimeMillis || durationMs,
          judulAudio: bestEp.r.trackName || episodeTitle,
          channelAudio: bestEp.r.collectionName || cleanShow || 'Podcast',
          isDirectHttpAudio: true,
        };
      }
    } catch {
      // Continue to RSS feed lookup
    }

    // 2. iTunes Podcast Show RSS Feed scrape -> match <item><enclosure> directly
    try {
      const showTerm = cleanShow || episodeTitle;
      const showSearchUrl = `https://itunes.apple.com/search?media=podcast&entity=podcast&term=${encodeURIComponent(
        showTerm
      )}&limit=5`;
      const showRes = await fetchJsonWithTimeout<{
        results?: Array<{
          collectionName?: string;
          artistName?: string;
          feedUrl?: string;
        }>;
      }>(showSearchUrl, 5000);

      for (const showItem of (showRes.results ?? []).slice(0, 3)) {
        if (!showItem.feedUrl || !/^https?:\/\//i.test(showItem.feedUrl)) continue;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        try {
          const rssRes = await fetch(showItem.feedUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': SCRAPE_UA, Accept: 'application/rss+xml, application/xml, text/xml' },
          });
          if (!rssRes.ok) continue;
          const xml = await rssRes.text();
          const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).slice(0, 40);
          let picked: { title: string; audioUrl: string; mime: string; score: number } | null = null;

          for (const m of itemMatches) {
            const block = m[0];
            const encMatch = block.match(
              /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*>/i
            );
            if (!encMatch?.[1]) continue;
            const audioUrl = decodeXmlEntities(encMatch[1]);
            if (!/^https?:\/\//i.test(audioUrl)) continue;
            const typeMatch = block.match(/<enclosure\b[^>]*type=["']([^"']+)["']/i);
            const rawMime = (typeMatch?.[1] || '').toLowerCase();
            const mime = rawMime.includes('mp4') || rawMime.includes('m4a') || audioUrl.includes('.m4a')
              ? 'audio/mp4'
              : 'audio/mpeg';

            const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
            const itemTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : episodeTitle;
            const sc = scoreTitleTokenMatch(itemTitle, episodeTitle);
            if (!picked || sc > picked.score) {
              picked = { title: itemTitle, audioUrl, mime, score: sc };
            }
          }

          if (picked && picked.score >= 0.45) {
            return {
              sourceUrl: picked.audioUrl,
              mimeType: picked.mime,
              sourceLabel: 'podcast-rss-full-episode',
              durasiMs: durationMs,
              judulAudio: picked.title || episodeTitle,
              channelAudio: showItem.collectionName || cleanShow || 'Podcast',
              isDirectHttpAudio: true,
            };
          }
        } catch {
          // Try next feed
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      // Fallback below
    }

    // 3. Fallback SoundCloud talk/podcast audio search
    const scFallback = await resolveSoundCloudAudio(combinedTerm, durationMs).catch(() => null);
    if (scFallback) {
      return {
        sourceUrl: null,
        mimeType: 'audio/mp4',
        sourceLabel: 'audio-full-stream',
        durasiMs: scFallback.durasiMs || durationMs,
        judulAudio: scFallback.judulAudio,
        channelAudio: scFallback.channelAudio,
        isDirectHttpAudio: false,
      };
    }

    // 4. Fallback Spotify audio preview if provided by embed
    if (spotifyPreviewUrl && /^https?:\/\//i.test(spotifyPreviewUrl)) {
      return {
        sourceUrl: spotifyPreviewUrl,
        mimeType: 'audio/mpeg',
        sourceLabel: 'spotify-podcast-stream',
        durasiMs: durationMs,
        judulAudio: episodeTitle,
        channelAudio: cleanShow || 'Podcast Spotify',
        isDirectHttpAudio: true,
      };
    }

    return null;
  }

  async function streamRemoteAudioWithRange(
    req: Request,
    res: Response,
    remoteUrl: string,
    fallbackMime: string,
    downloadName: string
  ) {
    const parsedUrl = new URL(remoteUrl);
    if (
      (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
      isPrivateOrLocalHost(parsedUrl.hostname)
    ) {
      throw new Error('URL sumber audio podcast tidak diizinkan.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const forwardHeaders: Record<string, string> = {
      'User-Agent': SCRAPE_UA,
      Accept: 'audio/*,*/*;q=0.8',
    };
    if (req.headers.range) {
      forwardHeaders.Range = req.headers.range;
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(remoteUrl, {
        signal: controller.signal,
        headers: forwardHeaders,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok || !upstream.body) {
      throw new Error(`Gagal mengambil stream audio podcast (HTTP ${upstream.status}).`);
    }

    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    const mimeType = upstreamType.startsWith('audio/') ? upstreamType.split(';')[0] : fallbackMime;
    const ext = mimeType.includes('mp4') || mimeType.includes('aac') ? 'm4a' : 'mp3';
    const safeName = downloadName.replace(/[^a-zA-Z0-9_.\- ]/g, '_').slice(0, 80) || 'efemma-podcast';

    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.${ext}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Media-Type', 'audio-only');

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const nodeStream = Readable.fromWeb(
      upstream.body as unknown as import('node:stream/web').ReadableStream
    );
    nodeStream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
    res.on('close', () => {
      try {
        nodeStream.destroy();
      } catch {
        // Ignore close destroy error
      }
    });
    return nodeStream.pipe(res);
  }

  app.get('/api/v1/spotify/podcast-play', async (req: Request, res: Response) => {
    const rawEpisodeId = String(req.query.episode_id || '').trim();
    const rawShowId = String(req.query.show_id || '').trim();
    const queryText = String(req.query.q || req.query.query || '').trim();
    const rawFormat = String(req.query.format || 'json').trim().toLowerCase();

    if (!rawEpisodeId && !rawShowId && !queryText) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'PARAMETER_KOSONG',
          pesan:
            'Isi parameter "q", "episode_id", atau "show_id" podcast Spotify yang ingin diputar.',
        },
      });
    }

    try {
      const episode = await resolveSpotifyPodcastEpisode(rawEpisodeId, rawShowId, queryText);
      if (!episode) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'PODCAST_TIDAK_DITEMUKAN',
            pesan: 'Episode atau acara podcast tidak ditemukan di web Spotify.',
          },
        });
      }

      const isVideoPodcast = episode.jenis_media === 'video' || episode.is_video_podcast;
      const searchStr = `${
        episode.show_nama !== 'Podcast Spotify' ? episode.show_nama : ''
      } ${episode.judul}`.trim();

      const [resolvedAudio, ytResults] = await Promise.all([
        resolvePodcastAudioUrl(
          episode.show_nama,
          episode.judul,
          episode.durasi_ms,
          episode.spotify_preview_audio
        ).catch(() => null),
        scrapeYouTubeVideos(
          isVideoPodcast ? searchStr : `${searchStr} podcast audio`,
          isVideoPodcast ? 'podcast_video' : 'music'
        ).catch(() => []),
      ]);

      if (rawFormat === 'audio' || rawFormat === 'mp3' || rawFormat === 'm4a') {
        const requestedMp3 = rawFormat === 'mp3';
        if (resolvedAudio?.isDirectHttpAudio && resolvedAudio.sourceUrl) {
          try {
            return await streamRemoteAudioWithRange(
              req,
              res,
              resolvedAudio.sourceUrl,
              requestedMp3 ? 'audio/mpeg' : resolvedAudio.mimeType,
              `${episode.show_nama} - ${episode.judul}`
            );
          } catch (streamErr) {
            if (res.headersSent) {
              res.end();
              return;
            }
            if (episode.spotify_preview_audio && resolvedAudio.sourceUrl !== episode.spotify_preview_audio) {
              return await streamRemoteAudioWithRange(
                req,
                res,
                episode.spotify_preview_audio,
                'audio/mpeg',
                `${episode.show_nama} - ${episode.judul}`
              );
            }
            throw streamErr;
          }
        }

        const audioFormat: 'm4a' | 'mp3' = requestedMp3 ? 'mp3' : 'm4a';
        const ensured = await ensureAudioFile(
          `pod_${episode.id}`,
          searchStr,
          episode.durasi_ms,
          audioFormat
        );
        return streamAudioFileWithRange(
          req,
          res,
          ensured.filePath,
          ensured.mimeType,
          `${episode.show_nama} - ${episode.judul}`
        );
      }

      const urls = buildSignedAudioUrls(
        req,
        episode.id,
        searchStr,
        episode.durasi_ms,
        '/api/v1/spotify/podcast-play'
      );

      const primaryYt = ytResults[0] ?? null;
      const hasVideoSource = Boolean(
        isVideoPodcast && (primaryYt || episode.spotify_preview_video)
      );

      if (!resolvedAudio && !primaryYt && !episode.spotify_preview_video) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'PODCAST_MEDIA_TIDAK_DITEMUKAN',
            pesan: 'Sumber video maupun audio penuh untuk episode podcast tersebut belum ditemukan.',
          },
          podcast: {
            show: {
              id: episode.show_id,
              nama: episode.show_nama,
              penerbit: episode.show_penerbit,
              sampul: episode.show_sampul,
            },
            episode,
          },
        });
      }

      const videoPayload = hasVideoSource
        ? primaryYt
          ? {
              video_id: primaryYt.video_id,
              embed_url: primaryYt.embed_url,
              watch_url: primaryYt.watch_url,
              judul_video: primaryYt.judul_youtube,
              channel: primaryYt.channel,
              thumbnail: primaryYt.thumbnail || episode.sampul,
              durasi_text: primaryYt.durasi_text,
              preview_video_url: episode.spotify_preview_video,
            }
          : {
              video_id: null,
              embed_url: null,
              watch_url: episode.spotify_url,
              judul_video: episode.judul,
              channel: episode.show_nama,
              thumbnail: episode.sampul,
              durasi_text: episode.durasi_format,
              preview_video_url: episode.spotify_preview_video,
            }
        : null;

      return res.json({
        sukses: true,
        layanan: 'spotify-podcast-play',
        sumber_data: isVideoPodcast
          ? 'spotify-web-scrape+youtube-video-podcast'
          : 'spotify-web-scrape+podcast-rss-audio',
        jenis_media: isVideoPodcast ? 'video' : 'audio',
        mode_pemutaran: isVideoPodcast ? 'video-podcast' : 'audio-only-podcast',
        tipe_media: isVideoPodcast
          ? primaryYt
            ? 'video/youtube-embed'
            : 'video/mp4'
          : resolvedAudio?.mimeType || 'audio/mpeg',
        video: videoPayload,
        audio: resolvedAudio
          ? {
              stream_url: urls.stream_url,
              mp3_stream_url: urls.mp3_stream_url,
              relative_stream_url: urls.relative_stream_url,
              relative_mp3_stream_url: urls.relative_mp3_stream_url,
              source_audio_url: resolvedAudio.sourceUrl,
              mime_type: resolvedAudio.mimeType,
              durasi_ms: resolvedAudio.durasiMs || episode.durasi_ms,
              sumber_audio: resolvedAudio.sourceLabel,
              judul_audio: resolvedAudio.judulAudio,
              channel_audio: resolvedAudio.channelAudio,
            }
          : primaryYt
          ? {
              stream_url: null,
              mp3_stream_url: null,
              relative_stream_url: null,
              relative_mp3_stream_url: null,
              source_audio_url: null,
              mime_type: isVideoPodcast ? 'video/youtube-embed' : 'audio/youtube-hidden',
              durasi_ms: episode.durasi_ms,
              sumber_audio: isVideoPodcast ? 'youtube-video-podcast' : 'youtube-audio-engine',
              judul_audio: primaryYt.judul_youtube,
              channel_audio: primaryYt.channel,
            }
          : null,
        podcast: {
          show: {
            id: episode.show_id,
            nama: episode.show_nama,
            penerbit: episode.show_penerbit,
            sampul: episode.show_sampul,
            spotify_url: episode.show_id
              ? `https://open.spotify.com/show/${episode.show_id}`
              : null,
          },
          episode: {
            id: episode.id,
            uri: episode.uri,
            judul: episode.judul,
            deskripsi: episode.deskripsi,
            durasi_ms: episode.durasi_ms,
            durasi_format: episode.durasi_format,
            tanggal_rilis: episode.tanggal_rilis,
            jenis_media: episode.jenis_media,
            sampul: episode.sampul,
            spotify_url: episode.spotify_url,
          },
        },
        youtube: primaryYt
          ? {
              video_id: primaryYt.video_id,
              judul_audio: primaryYt.judul_youtube,
              channel: primaryYt.channel,
              durasi_text: primaryYt.durasi_text,
              audio_url: resolvedAudio ? urls.stream_url : null,
            }
          : null,
      });
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      return sendSpotifyScrapeError(res, err);
    }
  });

  // 20. GET /api/v1/spotify/lirik (Matched directly to scraped Spotify track + LRCLIB synced lyrics + audio stream)
  app.get('/api/v1/spotify/lirik', async (req: Request, res: Response) => {
    const trackId = String(req.query.track_id || '').trim();
    const q = String(req.query.q || '').trim();

    if (!trackId && !q) {
      return res.status(400).json({
        sukses: false,
        kesalahan: {
          kode: 'PARAMETER_KOSONG',
          pesan: 'Isi "track_id" Spotify atau parameter query "q" untuk mengambil lirik lagu.',
        },
      });
    }

    try {
      const track = await resolveSpotifyTrackByScrape(trackId, q);
      if (!track) {
        return res.status(404).json({
          sukses: false,
          kesalahan: {
            kode: 'LAGU_TIDAK_DITEMUKAN',
            pesan: 'Track Spotify tidak ditemukan.',
          },
        });
      }

      const mainArtist = track.artis[0] || '';
      const trackName = track.judul;
      const albumName = track.album?.nama || '';
      const durationSec = Math.round(track.durasi_ms / 1000);
      const audioSearchQuery = `${mainArtist} ${trackName}`.trim();

      interface LrclibRecord {
        id: number;
        trackName?: string;
        artistName?: string;
        albumName?: string;
        duration?: number;
        instrumental?: boolean;
        plainLyrics?: string | null;
        syncedLyrics?: string | null;
      }

      const fetchLyrics = async (): Promise<LrclibRecord | null> => {
        try {
          const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(
            mainArtist
          )}&track_name=${encodeURIComponent(trackName)}&album_name=${encodeURIComponent(
            albumName
          )}&duration=${durationSec}`;
          return await fetchJsonWithTimeout<LrclibRecord>(getUrl, 4500);
        } catch {
          try {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
              `${mainArtist} ${trackName}`
            )}`;
            const list = await fetchJsonWithTimeout<LrclibRecord[]>(searchUrl, 4500);
            if (Array.isArray(list) && list.length > 0) {
              return list.find((x) => Boolean(x.syncedLyrics || x.plainLyrics)) ?? list[0];
            }
          } catch {
            return null;
          }
          return null;
        }
      };

      const [lrcData, scMeta, ytMatches] = await Promise.all([
        fetchLyrics(),
        resolveSoundCloudAudio(audioSearchQuery, track.durasi_ms).catch(() => null),
        scrapeYouTubeVideos(`${audioSearchQuery} official audio`.trim()).catch(() => []),
      ]);

      const urls = buildSignedAudioUrls(req, track.id, audioSearchQuery, track.durasi_ms);
      if (scMeta) {
        void ensureAudioFile(track.id, audioSearchQuery, track.durasi_ms, 'm4a').catch(() => {});
      }

      const syncedLines: Array<{ waktu_ms: number; timestamp: string; teks: string }> = [];
      if (lrcData?.syncedLyrics) {
        const lines = lrcData.syncedLyrics.split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/);
          if (match) {
            const mins = Number(match[1]);
            const secs = Number(match[2]);
            const frac = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
            const waktuMs = mins * 60_000 + secs * 1000 + frac;
            const teks = match[4].trim();
            if (teks) {
              syncedLines.push({
                waktu_ms: waktuMs,
                timestamp: `${match[1]}:${match[2]}${match[3] ? `.${match[3]}` : ''}`,
                teks,
              });
            }
          }
        }
      }

      const primaryYt = ytMatches[0] ?? null;
      return res.json({
        sukses: true,
        layanan: 'spotify-lirik',
        sumber_data: 'spotify-web-scrape+lrclib-live',
        track,
        audio: scMeta
          ? {
              stream_url: urls.stream_url,
              mp3_stream_url: urls.mp3_stream_url,
              relative_stream_url: urls.relative_stream_url,
              relative_mp3_stream_url: urls.relative_mp3_stream_url,
              mime_type: 'audio/mp4',
              durasi_ms: scMeta.durasiMs || track.durasi_ms,
              sumber_audio: 'audio-full-stream',
              judul_audio: scMeta.judulAudio,
              channel_audio: scMeta.channelAudio,
            }
          : null,
        youtube: primaryYt
          ? {
              video_id: primaryYt.video_id,
              judul_audio: primaryYt.judul_youtube,
              channel: primaryYt.channel,
              durasi_text: primaryYt.durasi_text,
              audio_url: scMeta ? urls.stream_url : null,
            }
          : null,
        lirik_tersedia: Boolean(lrcData && (lrcData.plainLyrics || syncedLines.length > 0)),
        instrumental: Boolean(lrcData?.instrumental),
        lirik_polos: lrcData?.plainLyrics ?? null,
        lirik_sinkron: syncedLines,
      });
    } catch (err) {
      return sendSpotifyScrapeError(res, err);
    }
  });

  // Catch-all for unknown /api/* routes
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      sukses: false,
      kesalahan: {
        kode: 'ENDPOINT_TIDAK_DITEMUKAN',
        pesan: `Rute ${req.method} ${req.originalUrl} tidak terdaftar pada EfemmaAPI.`,
      },
    });
  });

  // Global Express JSON error handler for /api routes (prevents raw Express 500 HTML pages)
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[EfemmaAPI] Unhandled API error:', err);
    if (res.headersSent) {
      res.end();
      return;
    }
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan internal pada server API.';
    res.status(502).json({
      sukses: false,
      kesalahan: { kode: 'INTERNAL_API_ERROR', pesan: msg },
    });
  });

  const httpServer = http.createServer(app);

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr
          ? { hmr: false, ws: false, watch: null }
          : { hmr: { server: httpServer }, ws: { server: httpServer } }),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output tidak ditemukan. Jalankan npm run build terlebih dahulu.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EfemmaAPI server berjalan pada http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Gagal menjalankan server EfemmaAPI:', err);
  process.exit(1);
});

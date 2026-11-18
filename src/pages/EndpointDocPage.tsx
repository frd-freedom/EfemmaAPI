import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  EyeOff,
  Home,
  Info,
  KeyRound,
  Lock,
  LogIn,
  Music2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { ActiveFullSongTrack, SpotifyPlayerPanel } from '../components/SpotifyPlayerPanel';
import {
  API_ENDPOINTS,
  ApiEndpointSpec,
  buildPostBody,
  buildRequestUrl,
  generateCodeSnippet,
} from '../data/apiCatalog';
import { auth } from '../lib/firebase';
import { checkEndpointAccess, getRoleCountdown, toEpochMs } from '../lib/roleExpiry';
import { ADMIN_EMAIL, DEFAULT_CATEGORY_ORDER, PageRoute, SiteContent, UserProfile } from '../types/app';

interface EndpointDocPageProps {
  endpointId: string;
  content: SiteContent;
  userProfile: UserProfile | null;
  onLoginGoogle: () => void;
  onNavigate: (route: PageRoute) => void;
  onRecordUsageLog: (log: {
    endpointId: string;
    method: 'GET' | 'POST';
    path: string;
    status: number;
    latencyMs: number;
  }) => Promise<void>;
  onRefreshUserProfile: () => Promise<void>;
}

interface SpotifyTrackPreview {
  id: string;
  judul: string;
  artis?: string[];
  durasi_format?: string;
  album?: { nama?: string; sampul?: string | null } | null;
}

interface SpotifyPodcastEpisodePreview {
  id: string;
  judul: string;
  durasi_format?: string;
  tanggal_rilis?: string | null;
  sampul?: string | null;
}

interface SpotifyLyricsSyncLine {
  waktu_ms: number;
  timestamp: string;
  teks: string;
}

interface LiveResponseState {
  status: number;
  statusText: string;
  latencyMs: number;
  sizeBytes: number;
  bodyText: string;
  headers: Array<[string, string]>;
  isError: boolean;
}

type DocTab = 'playground' | 'skema' | 'kode';
type CodeLang = 'curl' | 'javascript' | 'typescript' | 'python';
type ResponseViewTab = 'body' | 'headers';

function getInitialValues(endpoint: ApiEndpointSpec): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const p of endpoint.params) {
    obj[p.name] = p.defaultValue;
  }
  return obj;
}

export function EndpointDocPage({
  endpointId,
  content,
  userProfile,
  onLoginGoogle,
  onNavigate,
  onRecordUsageLog,
  onRefreshUserProfile,
}: EndpointDocPageProps) {
  const endpoint = useMemo(
    () => API_ENDPOINTS.find((ep) => ep.id === endpointId) ?? API_ENDPOINTS[0],
    [endpointId]
  );

  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    getInitialValues(endpoint)
  );
  const [apiKeyInput, setApiKeyInput] = useState<string>(userProfile?.apiKey ?? '');
  const [activeTab, setActiveTab] = useState<DocTab>('playground');
  const [codeLang, setCodeLang] = useState<CodeLang>('curl');
  const [responseTab, setResponseTab] = useState<ResponseViewTab>('body');
  const [loading, setLoading] = useState(false);
  const [liveResponse, setLiveResponse] = useState<LiveResponseState | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState('');
  const [playbackPosMs, setPlaybackPosMs] = useState(0);
  const [activeFullSong, setActiveFullSong] = useState<ActiveFullSongTrack | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const initial = getInitialValues(endpoint);
    const pendingTrackId = sessionStorage.getItem('efemma_pending_track_id');
    const pendingTarget = sessionStorage.getItem('efemma_pending_track_target');
    if (pendingTrackId && pendingTarget === endpoint.id) {
      initial.track_id = pendingTrackId;
      if ('query' in initial) initial.query = '';
      if ('q' in initial) initial.q = '';
      sessionStorage.removeItem('efemma_pending_track_id');
      sessionStorage.removeItem('efemma_pending_track_target');
    }
    const pendingEpisodeId = sessionStorage.getItem('efemma_pending_episode_id');
    const pendingEpTarget = sessionStorage.getItem('efemma_pending_episode_target');
    if (pendingEpisodeId && pendingEpTarget === endpoint.id) {
      initial.episode_id = pendingEpisodeId;
      if ('q' in initial) initial.q = '';
      sessionStorage.removeItem('efemma_pending_episode_id');
      sessionStorage.removeItem('efemma_pending_episode_target');
    }
    setParamValues(initial);
    setLiveResponse(null);
    setResponseTab('body');
    setKeyError('');
  }, [endpoint]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (userProfile?.apiKey) {
      setApiKeyInput(userProfile.apiKey);
    } else {
      setApiKeyInput('');
    }
  }, [userProfile?.apiKey]);

  const requestRelativeUrl = useMemo(
    () => buildRequestUrl(endpoint, paramValues, ''),
    [endpoint, paramValues]
  );

  const codeSnippet = useMemo(
    () => generateCodeSnippet(codeLang, endpoint, paramValues, apiKeyInput),
    [codeLang, endpoint, paramValues, apiKeyInput]
  );

  const isAdmin = userProfile?.role === 'admin';
  const isUnlimited = isAdmin || userProfile?.dailyLimit === -1;
  const remainingCredits = userProfile
    ? isUnlimited
      ? Infinity
      : Math.max(0, userProfile.dailyLimit - userProfile.creditsUsedToday)
    : 0;

  const endpointAccess = useMemo(
    () => checkEndpointAccess(endpoint.id, content, userProfile?.role ?? null),
    [endpoint.id, content, userProfile?.role]
  );

  const privateAllowedText =
    endpointAccess.allowedRoles.length > 0
      ? `${endpointAccess.allowedRoles.map((r) => r.toUpperCase()).join(' / ')} (+ ADMIN)`
      : 'Hanya ADMIN';

  const [nowMs, setNowMs] = useState(() => Date.now());
  const roleExpiresAtMs = toEpochMs(userProfile?.roleExpiresAt);
  const hasTimedRole =
    Boolean(userProfile) &&
    userProfile?.email.toLowerCase() !== ADMIN_EMAIL &&
    userProfile?.role !== 'free' &&
    roleExpiresAtMs > 0;

  useEffect(() => {
    if (!hasTimedRole) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, [hasTimedRole, roleExpiresAtMs]);

  const roleCountdown = hasTimedRole ? getRoleCountdown(roleExpiresAtMs, nowMs) : null;

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      // Ignore
    }
  };

  const isSuspended =
    Boolean(userProfile?.suspended) &&
    userProfile?.email.toLowerCase() !== ADMIN_EMAIL;

  const handleSendRequest = async () => {
    if (!userProfile || !auth.currentUser) {
      onLoginGoogle();
      return;
    }

    if (isSuspended) {
      setKeyError(
        userProfile.suspendedReason
          ? `Akun Anda sedang disuspend (${userProfile.suspendedReason}). Eksekusi API dinonaktifkan.`
          : 'Akun Anda sedang disuspend oleh Administrator. Eksekusi API dinonaktifkan.'
      );
      return;
    }

    if (endpointAccess.isPrivate && !endpointAccess.hasAccess) {
      setKeyError(
        `Endpoint ini bersifat Private dan hanya dapat diakses oleh role ${privateAllowedText}.`
      );
      return;
    }

    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      setKeyError('Masukkan API Key Anda sebelum mengirim permintaan.');
      return;
    }
    setKeyError('');

    setLoading(true);
    const start = performance.now();
    try {
      const idToken = await auth.currentUser.getIdToken();
      const headers: Record<string, string> = {
        Accept: 'application/json, audio/*',
        Authorization: `Bearer ${idToken}`,
        'x-efemma-key': trimmedKey,
      };

      const init: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (endpoint.method === 'POST') {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(buildPostBody(endpoint, paramValues));
      }

      const res = await fetch(requestRelativeUrl, init);
      const elapsed = Math.round(performance.now() - start);
      const contentType = res.headers.get('content-type') || '';

      let formatted = '';
      let byteLength = 0;

      if (contentType.startsWith('audio/')) {
        const blob = await res.blob();
        byteLength = blob.size;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const objUrl = URL.createObjectURL(blob);
        blobUrlRef.current = objUrl;

        const isPodcastEndpoint = endpoint.id === 'spotify-podcast-play';
        const titleGuess =
          paramValues.q ||
          paramValues.query ||
          paramValues.episode_id ||
          paramValues.track_id ||
          (isPodcastEndpoint ? 'Audio Episode Podcast' : 'Audio Full Song');
        if (res.ok) {
          setActiveFullSong({
            trackId: paramValues.episode_id || paramValues.track_id || undefined,
            judul: titleGuess,
            artis: [isPodcastEndpoint ? 'Stream Podcast Langsung' : 'Audio Stream Langsung'],
            audioStreamUrl: objUrl,
            audioMimeType: contentType,
            mediaKind: isPodcastEndpoint ? 'podcast' : 'song',
          });
        }
        formatted = JSON.stringify(
          {
            sukses: res.ok,
            tipe_respons: 'audio-binary-stream',
            content_type: contentType,
            ukuran_byte: blob.size,
            media_type: res.headers.get('x-media-type') || 'audio-only',
          },
          null,
          2
        );
      } else {
        const rawText = await res.text();
        byteLength = new Blob([rawText]).size;
        formatted = rawText;
        try {
          const parsedJson = JSON.parse(rawText) as {
            sukses?: boolean;
            jenis_media?: 'video' | 'audio';
            track?: {
              id?: string;
              judul?: string;
              artis?: string[];
              durasi_ms?: number;
              spotify_url?: string | null;
              album?: { nama?: string; sampul?: string | null } | null;
            };
            video?: {
              video_id?: string | null;
              embed_url?: string | null;
              watch_url?: string | null;
              judul_video?: string | null;
              channel?: string | null;
              preview_video_url?: string | null;
            } | null;
            podcast?: {
              show?: {
                id?: string | null;
                nama?: string;
                sampul?: string | null;
              };
              episode?: {
                id?: string;
                judul?: string;
                durasi_ms?: number;
                jenis_media?: 'video' | 'audio';
                sampul?: string | null;
                spotify_url?: string | null;
              };
            } | null;
            audio?: {
              stream_url?: string | null;
              relative_stream_url?: string | null;
              mime_type?: string | null;
              channel_audio?: string | null;
            } | null;
            youtube?: {
              video_id?: string;
              judul_audio?: string;
              judul_youtube?: string;
              channel?: string;
            } | null;
          };
          formatted = JSON.stringify(parsedJson, null, 2);

          const playableStreamUrl =
            parsedJson.audio?.relative_stream_url || parsedJson.audio?.stream_url || null;
          const resolvedVideoId =
            parsedJson.video?.video_id ?? parsedJson.youtube?.video_id ?? null;
          const previewVideoUrl = parsedJson.video?.preview_video_url ?? null;
          const isVideoPodcast =
            (parsedJson.jenis_media === 'video' || parsedJson.podcast?.episode?.jenis_media === 'video') &&
            Boolean(resolvedVideoId || previewVideoUrl);
          const hasPlayableEngine = Boolean(
            playableStreamUrl || resolvedVideoId || previewVideoUrl
          );

          if (res.ok && parsedJson.sukses && hasPlayableEngine) {
            if (parsedJson.podcast?.episode?.judul) {
              const ep = parsedJson.podcast.episode;
              const sh = parsedJson.podcast.show;
              setActiveFullSong({
                trackId: ep.id,
                judul: ep.judul || 'Episode Podcast',
                artis: [sh?.nama || 'Podcast Spotify'],
                sampul: ep.sampul || sh?.sampul || null,
                spotifyUrl: ep.spotify_url ?? null,
                audioStreamUrl: playableStreamUrl,
                audioMimeType: parsedJson.audio?.mime_type ?? null,
                audioChannel: parsedJson.audio?.channel_audio ?? null,
                videoId: resolvedVideoId,
                videoEmbedUrl: parsedJson.video?.embed_url ?? null,
                videoWatchUrl: parsedJson.video?.watch_url ?? null,
                previewVideoUrl,
                youtubeTitle:
                  parsedJson.video?.judul_video ||
                  parsedJson.youtube?.judul_audio ||
                  parsedJson.youtube?.judul_youtube ||
                  null,
                youtubeChannel:
                  parsedJson.video?.channel || parsedJson.youtube?.channel || null,
                durasiMs: ep.durasi_ms,
                mediaKind: 'podcast',
                mediaFormat: isVideoPodcast ? 'video' : 'audio',
              });
            } else if (parsedJson.track?.judul) {
              setActiveFullSong({
                trackId: parsedJson.track.id,
                judul: parsedJson.track.judul,
                artis: parsedJson.track.artis ?? [],
                album: parsedJson.track.album?.nama,
                sampul: parsedJson.track.album?.sampul ?? null,
                spotifyUrl: parsedJson.track.spotify_url ?? null,
                audioStreamUrl: playableStreamUrl,
                audioMimeType: parsedJson.audio?.mime_type ?? null,
                audioChannel: parsedJson.audio?.channel_audio ?? null,
                videoId: parsedJson.youtube?.video_id ?? null,
                youtubeTitle: parsedJson.youtube?.judul_audio || parsedJson.youtube?.judul_youtube || null,
                youtubeChannel: parsedJson.youtube?.channel ?? null,
                durasiMs: parsedJson.track.durasi_ms,
                mediaKind: 'song',
                mediaFormat: 'audio',
              });
            }
          }
        } catch {
          // Keep raw
        }
      }

      const interestingHeaders: Array<[string, string]> = [];
      res.headers.forEach((value, name) => {
        if (
          name.startsWith('x-') ||
          name === 'content-type' ||
          name === 'accept-ranges' ||
          name === 'content-length' ||
          name === 'cache-control'
        ) {
          interestingHeaders.push([name, value]);
        }
      });

      setLiveResponse({
        status: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        latencyMs: elapsed,
        sizeBytes: byteLength,
        bodyText: formatted,
        headers: interestingHeaders,
        isError: !res.ok,
      });

      await Promise.allSettled([
        onRefreshUserProfile(),
        onRecordUsageLog({
          endpointId: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          status: res.status,
          latencyMs: elapsed,
        }),
      ]);
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi server API.';
      setLiveResponse({
        status: 0,
        statusText: 'Network Error',
        latencyMs: elapsed,
        sizeBytes: msg.length,
        bodyText: JSON.stringify({ sukses: false, kesalahan: { pesan: msg } }, null, 2),
        headers: [],
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const displayedJson = liveResponse
    ? liveResponse.bodyText
    : JSON.stringify(endpoint.sampleResponse, null, 2);

  const parsedSpotifyData = useMemo(() => {
    if (!liveResponse || liveResponse.isError || endpoint.category !== 'spotify') {
      return null;
    }
    try {
      const parsed = JSON.parse(liveResponse.bodyText) as Record<string, unknown>;
      const tracks: SpotifyTrackPreview[] = [];
      const addTracks = (arr: unknown) => {
        if (!Array.isArray(arr)) return;
        for (const item of arr) {
          if (item && typeof item === 'object' && 'id' in item && 'judul' in item && 'durasi_ms' in item) {
            tracks.push(item as SpotifyTrackPreview);
          }
        }
      };
      addTracks(parsed.tracks);
      addTracks(parsed.tracks_by_genre);
      if (parsed.type === 'track') addTracks(parsed.items);
      if (parsed.detail && typeof parsed.detail === 'object') {
        const d = parsed.detail as Record<string, unknown>;
        addTracks(d.tracks);
        addTracks(d.top_tracks);
      }
      if (parsed.library && typeof parsed.library === 'object') {
        addTracks((parsed.library as Record<string, unknown>).tracks);
      }
      const episodes: SpotifyPodcastEpisodePreview[] = [];
      if (Array.isArray(parsed.episodes)) {
        for (const ep of parsed.episodes) {
          if (ep && typeof ep === 'object' && 'id' in ep && 'judul' in ep) {
            episodes.push(ep as SpotifyPodcastEpisodePreview);
          }
        }
      }
      const lyricsPlain = typeof parsed.lirik_polos === 'string' ? parsed.lirik_polos : null;
      const lyricsSync = Array.isArray(parsed.lirik_sinkron)
        ? (parsed.lirik_sinkron as SpotifyLyricsSyncLine[])
        : [];
      return {
        tracks: tracks.slice(0, 12),
        episodes: episodes.slice(0, 12),
        lyricsPlain,
        lyricsSync,
      };
    } catch {
      return null;
    }
  }, [liveResponse, endpoint.category]);

  const isEndpointHidden =
    content.hiddenCategories.includes(endpoint.category) ||
    content.hiddenEndpointIds.includes(endpoint.id);

  const orderedEndpoints = useMemo(() => {
    const order =
      Array.isArray(content.categoryOrder) && content.categoryOrder.length > 0
        ? content.categoryOrder
        : DEFAULT_CATEGORY_ORDER;
    const visible = API_ENDPOINTS.filter((ep) => {
      const hidden =
        content.hiddenCategories.includes(ep.category) ||
        content.hiddenEndpointIds.includes(ep.id);
      if (!hidden) return true;
      return isAdmin && ep.id === endpoint.id;
    });
    return [...visible].sort((a, b) => {
      const ia = order.indexOf(a.category);
      const ib = order.indexOf(b.category);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [
    content.categoryOrder,
    content.hiddenCategories,
    content.hiddenEndpointIds,
    endpoint.id,
    isAdmin,
  ]);

  const currentOrderedIndex = orderedEndpoints.findIndex((ep) => ep.id === endpoint.id);
  const prevEndpoint = currentOrderedIndex > 0 ? orderedEndpoints[currentOrderedIndex - 1] : null;
  const nextEndpoint =
    currentOrderedIndex >= 0 && currentOrderedIndex < orderedEndpoints.length - 1
      ? orderedEndpoints[currentOrderedIndex + 1]
      : null;

  if (isEndpointHidden && !isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 lg:px-10">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-[#111111]">
          <EyeOff className="mx-auto h-8 w-8 text-slate-400" />
          <h1 className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-white">
            Endpoint Sedang Disembunyikan
          </h1>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Layanan endpoint ini saat ini disembunyikan oleh Administrator. Silakan pilih endpoint lain di bilah navigasi.
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

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-5 sm:py-10 lg:px-8 lg:py-12">
      {isEndpointHidden && isAdmin && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          <EyeOff className="h-4 w-4 shrink-0" />
          <span>
            Mode Admin: Endpoint ini sedang disembunyikan dari katalog publik dan hanya terlihat untuk pengujian Administrator.
          </span>
        </div>
      )}
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
      >
        <button
          type="button"
          onClick={() => onNavigate({ page: 'welcome' })}
          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        <span aria-hidden="true">/</span>
        <span>{endpoint.categoryLabel}</span>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-900 dark:text-slate-200">{endpoint.title}</span>
      </nav>

      {/* Endpoint Title & Summary */}
      <div className="mt-5 border-b border-slate-200/70 pb-6 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl [text-wrap:balance]">
            {endpoint.title}
          </h1>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${
              endpoint.method === 'GET'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
            }`}
          >
            {endpoint.method}
          </span>
          {endpointAccess.isPrivate && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium uppercase text-amber-700 dark:text-amber-300">
              <Lock className="h-3 w-3" />
              <span>Private · {endpointAccess.allowedRoles.map((r) => r.toUpperCase()).join(' / ')}</span>
            </span>
          )}
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {endpoint.summary}
        </p>

        {/* Path Bar */}
        <div className="mt-4 flex min-w-0 items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 sm:px-3.5 py-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs text-slate-900 dark:text-sky-300 whitespace-nowrap">
            {endpoint.method} {requestRelativeUrl}
          </code>
          <button
            type="button"
            onClick={() => handleCopy('url', requestRelativeUrl)}
            className="inline-flex items-center gap-1 rounded border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white shrink-0 cursor-pointer"
          >
            {copiedKey === 'url' ? (
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

      {/* Admin-editable Docs Notice */}
      <div className="mt-5 flex min-w-0 items-start gap-2.5 rounded-xl border border-sky-500/35 bg-sky-500/[0.07] px-4 py-3 text-xs leading-relaxed text-sky-900 dark:bg-sky-500/[0.09] dark:text-sky-200">
        <Info className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400 mt-0.5" />
        <span className="min-w-0 break-words">{content.docsNotice}</span>
      </div>

      {/* Auth & Daily Credit Status Strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-transparent px-4 py-3.5 dark:border-white/[0.08]">
        {userProfile ? (
          <>
            <div className="text-xs space-y-0.5">
              <div className="font-medium text-slate-900 dark:text-white">
                {userProfile.email}{' '}
                <span className="font-mono uppercase text-slate-500 dark:text-slate-400">
                  · {userProfile.role}
                </span>
              </div>
              <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                {isAdmin
                  ? 'Akses Admin: Kredit harian tidak terbatas (Unlimited) & selalu dapat mengakses endpoint Private.'
                  : isUnlimited
                  ? `Akses ${userProfile.role.toUpperCase()}: Kredit harian tidak terbatas (Unlimited).`
                  : `Sisa kredit hari ini: ${remainingCredits} dari ${userProfile.dailyLimit} (1 permintaan = 1 kredit)`}
              </div>
              {roleCountdown && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-sky-700 dark:text-sky-300 tabular-nums">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Sisa masa aktif role: {roleCountdown.summary}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isUnlimited && remainingCredits === 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate({ page: 'pricing' })}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  {content.docsUpgradeButtonLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate({ page: 'keys' })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
              >
                {content.docsViewKeyButtonLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Masuk dengan Google dan gunakan API Key Anda untuk menjalankan endpoint (10
              kredit gratis per hari untuk role Free).
            </div>
            <button
              type="button"
              onClick={onLoginGoogle}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 shrink-0 cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{content.docsLoginButtonLabel}</span>
            </button>
          </>
        )}
      </div>

      {/* Private Endpoint Access Banner (Documentation remains visible to Free/Guest, execution restricted) */}
      {endpointAccess.isPrivate && !endpointAccess.hasAccess && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Endpoint Private — Akses Terbatas ({privateAllowedText})
              </div>
              <p className="text-amber-800/90 dark:text-amber-200/80">
                Anda dapat melihat dokumentasi, skema respons, dan contoh kode endpoint ini, namun permintaan eksekusi (Playground maupun API Key) hanya diizinkan untuk role{' '}
                <strong>{privateAllowedText}</strong>.
              </p>
            </div>
          </div>
          {userProfile ? (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'pricing' })}
              className="shrink-0 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
            >
              Upgrade Role
            </button>
          ) : (
            <button
              type="button"
              onClick={onLoginGoogle}
              className="shrink-0 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              Masuk Google
            </button>
          )}
        </div>
      )}

      {/* Spotify Web Scrape & Audio-Only Full Song Player */}
      {endpoint.category === 'spotify' && (
        <SpotifyPlayerPanel
          content={content}
          activeTrack={activeFullSong}
          onCloseTrack={() => setActiveFullSong(null)}
          onPlaybackPositionMs={setPlaybackPosMs}
        />
      )}

      {/* Tabs */}
      <div className="mt-6 flex w-full max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-fit dark:border-white/10 dark:bg-[#111111]">
        {(
          [
            { id: 'playground', label: 'Playground Interaktif' },
            { id: 'skema', label: 'Skema Parameter & Respons' },
            { id: 'kode', label: 'Contoh Kode SDK' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-slate-950 shadow-xs dark:bg-white/15 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0"
        >
      {activeTab === 'playground' && (
        <div className="mt-6 space-y-6 min-w-0 max-w-full">
          {/* API Key Input Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="official-api-key-input"
                className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 dark:text-white"
              >
                <KeyRound className="h-3.5 w-3.5 text-sky-500" />
                <span>Header x-efemma-key</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Wajib diisi dengan API Key akun Anda
              </span>
            </div>
            <input
              id="official-api-key-input"
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={
                userProfile
                  ? 'Masukkan API Key akun Anda'
                  : 'Masuk terlebih dahulu untuk mendapatkan API Key'
              }
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
            />
            {keyError && <p className="mt-1.5 text-xs text-rose-500">{keyError}</p>}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Parameter Permintaan
            </h2>
            <button
              type="button"
              onClick={() => {
                setParamValues(getInitialValues(endpoint));
                setLiveResponse(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="space-y-4">
            {endpoint.params.map((param) => (
              <div
                key={param.name}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`ep-param-${param.name}`}
                      className="font-mono text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      {param.name}
                    </label>
                    <span className="h-3 w-px bg-slate-300 dark:bg-white/15" aria-hidden="true" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {param.location === 'query' ? 'Query' : 'Body JSON'} /{' '}
                      {param.required ? 'Wajib' : 'Opsional'}
                    </span>
                  </div>

                  {param.presets && (
                    <div className="flex flex-wrap gap-1.5">
                      {param.presets.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() =>
                            setParamValues((prev) => ({ ...prev, [param.name]: preset.value }))
                          }
                          className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer ${
                            paramValues[param.name] === preset.value
                              ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                              : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {param.description}
                </p>

                <div className="mt-2.5">
                  {param.type === 'select' && param.options ? (
                    <select
                      id={`ep-param-${param.name}`}
                      value={paramValues[param.name] ?? param.defaultValue}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    >
                      {param.defaultValue === '' && (
                        <option value="">Kosong (Default Server)</option>
                      )}
                      {param.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : param.type === 'json' ? (
                    <textarea
                      id={`ep-param-${param.name}`}
                      rows={5}
                      value={paramValues[param.name] ?? ''}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  ) : (
                    <input
                      id={`ep-param-${param.name}`}
                      type={param.type === 'number' ? 'number' : 'text'}
                      value={paramValues[param.name] ?? ''}
                      placeholder={param.placeholder}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-[#0A0A0A] dark:text-white"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            {isSuspended ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-5 py-2.5 text-xs font-semibold text-rose-700 opacity-90 dark:text-rose-300 cursor-not-allowed"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Akun Disuspend — Eksekusi Diblokir</span>
              </button>
            ) : endpointAccess.isPrivate && !endpointAccess.hasAccess ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-xs font-semibold text-amber-800 opacity-90 dark:text-amber-200 cursor-not-allowed"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>
                  Terkunci — Khusus Role {privateAllowedText}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendRequest}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>
                  {loading
                    ? 'Mengirim...'
                    : userProfile
                    ? content.docsRunButtonLabel
                    : content.docsLoginButtonLabel}
                </span>
              </button>
            )}
          </div>

          {/* Response Viewer */}
          <div className="border-t border-slate-200 pt-6 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {liveResponse ? 'Respons Server' : 'Contoh Struktur Respons'}
                </h3>

                {liveResponse && (
                  <div className="flex items-center gap-2.5 font-mono text-xs tabular-nums">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        liveResponse.isError
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {liveResponse.isError ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {liveResponse.status} {liveResponse.statusText}
                      </span>
                    </span>
                    <span className="h-3 w-px bg-slate-300 dark:bg-white/15" aria-hidden="true" />
                    <span className="text-slate-600 dark:text-slate-300">
                      {liveResponse.latencyMs} ms
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {liveResponse && liveResponse.headers.length > 0 && (
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-[#111111]">
                    <button
                      type="button"
                      onClick={() => setResponseTab('body')}
                      className={`rounded-md px-2.5 py-1 cursor-pointer ${
                        responseTab === 'body'
                          ? 'bg-white text-slate-900 font-medium dark:bg-white/15 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Body
                    </button>
                    <button
                      type="button"
                      onClick={() => setResponseTab('headers')}
                      className={`rounded-md px-2.5 py-1 cursor-pointer ${
                        responseTab === 'headers'
                          ? 'bg-white text-slate-900 font-medium dark:bg-white/15 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Headers ({liveResponse.headers.length})
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy('resp', displayedJson)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                >
                  {copiedKey === 'resp' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin JSON</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {responseTab === 'headers' && liveResponse ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#111111]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Header</th>
                      <th className="px-4 py-2.5 font-medium">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono dark:divide-white/5">
                    {liveResponse.headers.map(([k, v]) => (
                      <tr key={k}>
                        <td className="px-4 py-2.5 text-sky-700 dark:text-sky-400">{k}</td>
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200 break-all">
                          {v}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="mt-3 max-h-[380px] w-full max-w-full overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-white/10 dark:bg-[#111111]">
                <code>{displayedJson}</code>
              </pre>
            )}

            {/* Interactive Spotify Track Preview Cards (Play Full Song / Lyrics) */}
            {parsedSpotifyData && parsedSpotifyData.tracks.length > 0 && (
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <Music2 className="h-4 w-4 text-emerald-500" />
                  <span>Pratinjau Lagu Spotify (Aksi Cepat Full Song &amp; Lirik)</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {parsedSpotifyData.tracks.map((tr) => (
                    <div
                      key={tr.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111111] min-w-0 overflow-hidden"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {tr.album?.sampul ? (
                          <img
                            src={tr.album.sampul}
                            alt={tr.judul}
                            referrerPolicy="no-referrer"
                            className="h-10 w-10 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                            <Music2 className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                            {tr.judul}
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {(tr.artis ?? []).join(', ')}
                            {tr.durasi_format ? ` / ${tr.durasi_format}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem('efemma_pending_track_id', tr.id);
                            sessionStorage.setItem('efemma_pending_track_target', 'spotify-play');
                            onNavigate({ page: 'docs', endpointId: 'spotify-play' });
                          }}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                        >
                          Play Full
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem('efemma_pending_track_id', tr.id);
                            sessionStorage.setItem('efemma_pending_track_target', 'spotify-lirik');
                            onNavigate({ page: 'docs', endpointId: 'spotify-lirik' });
                          }}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                        >
                          Lirik
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Spotify Podcast Episode Preview Cards (Play Full Podcast) */}
            {parsedSpotifyData && parsedSpotifyData.episodes.length > 0 && (
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <Music2 className="h-4 w-4 text-sky-500" />
                  <span>Episode Podcast Spotify (Putar Video / Audio Podcast)</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {parsedSpotifyData.episodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111111] min-w-0 overflow-hidden"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {ep.sampul ? (
                          <img
                            src={ep.sampul}
                            alt={ep.judul}
                            referrerPolicy="no-referrer"
                            className="h-10 w-10 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                            <Music2 className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                            {ep.judul}
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {ep.tanggal_rilis || 'Podcast'}
                            {ep.durasi_format ? ` / ${ep.durasi_format}` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('efemma_pending_episode_id', ep.id);
                          sessionStorage.setItem(
                            'efemma_pending_episode_target',
                            'spotify-podcast-play'
                          );
                          onNavigate({ page: 'docs', endpointId: 'spotify-podcast-play' });
                        }}
                        className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 shrink-0 cursor-pointer"
                      >
                        Putar Podcast
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Spotify Lyrics Viewer */}
            {parsedSpotifyData &&
              (parsedSpotifyData.lyricsSync.length > 0 || parsedSpotifyData.lyricsPlain) && (
                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-xs font-bold text-slate-900 dark:text-white">
                      Lirik Lagu Terintegrasi Spotify
                    </span>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                      {parsedSpotifyData.lyricsSync.length > 0 ? 'Sinkron LRC' : 'Teks Lirik'}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs leading-relaxed">
                    {parsedSpotifyData.lyricsSync.length > 0 ? (
                      parsedSpotifyData.lyricsSync.map((ln, idx) => {
                        const nextLine = parsedSpotifyData.lyricsSync[idx + 1];
                        const isActive =
                          playbackPosMs > 0 &&
                          playbackPosMs >= ln.waktu_ms &&
                          (!nextLine || playbackPosMs < nextLine.waktu_ms);
                        return (
                          <div
                            key={`${ln.waktu_ms}-${idx}`}
                            className={`flex items-baseline gap-3 rounded px-2 py-1 ${
                              isActive
                                ? 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              [{ln.timestamp}]
                            </span>
                            <span>{ln.teks}</span>
                          </div>
                        );
                      })
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-300">
                        {parsedSpotifyData.lyricsPlain}
                      </pre>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {activeTab === 'skema' && (
        <div className="mt-6 space-y-8 min-w-0 max-w-full">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Parameter Masukan
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Parameter</th>
                    <th className="px-4 py-3 font-medium">Lokasi</th>
                    <th className="px-4 py-3 font-medium">Tipe</th>
                    <th className="px-4 py-3 font-medium">Wajib</th>
                    <th className="px-4 py-3 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {endpoint.params.map((p) => (
                    <tr key={p.name}>
                      <td className="px-4 py-3 font-mono font-semibold text-sky-700 dark:text-sky-400">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 font-mono">{p.location}</td>
                      <td className="px-4 py-3 font-mono">{p.type}</td>
                      <td className="px-4 py-3">{p.required ? 'Ya' : 'Opsional'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {p.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Field Respons JSON
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Field</th>
                    <th className="px-4 py-3 font-medium">Tipe</th>
                    <th className="px-4 py-3 font-medium">Deskripsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {endpoint.responseFields.map((rf) => (
                    <tr key={rf.field}>
                      <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-400">
                        {rf.field}
                      </td>
                      <td className="px-4 py-3 font-mono">{rf.type}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {rf.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'kode' && (
        <div className="mt-6 min-w-0 max-w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap max-w-full rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-[#111111]">
              {(
                [
                  { id: 'curl', label: 'cURL' },
                  { id: 'javascript', label: 'JavaScript' },
                  { id: 'typescript', label: 'TypeScript' },
                  { id: 'python', label: 'Python' },
                ] as const
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setCodeLang(lang.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                    codeLang === lang.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleCopy('code', codeSnippet)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
            >
              {copiedKey === 'code' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Kode</span>
                </>
              )}
            </button>
          </div>

          <pre className="mt-4 w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-white/10 dark:bg-[#111111]">
            <code>{codeSnippet}</code>
          </pre>
        </div>
      )}
        </motion.div>
      </AnimatePresence>

      {/* Previous / Next Endpoint Navigation */}
      {(prevEndpoint || nextEndpoint) && (
        <nav
          aria-label="Navigasi endpoint sebelum dan selanjutnya"
          className="mt-10 grid grid-cols-1 gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2 dark:border-white/10"
        >
          {prevEndpoint ? (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'docs', endpointId: prevEndpoint.id })}
              className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/50 dark:border-white/10 dark:bg-[#111111] dark:hover:border-sky-400/50 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-400" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Sebelumnya</div>
                  <div className="truncate font-display text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    {prevEndpoint.title}
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}

          {nextEndpoint && (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'docs', endpointId: nextEndpoint.id })}
              className="group flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-right transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/50 dark:border-white/10 dark:bg-[#111111] dark:hover:border-sky-400/50 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Selanjutnya</div>
                  <div className="truncate font-display text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    {nextEndpoint.title}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-400" />
              </div>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

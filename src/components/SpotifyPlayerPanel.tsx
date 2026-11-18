import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Disc3,
  ExternalLink,
  Headphones,
  Loader2,
  Pause,
  Play,
  Radio,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { SiteContent } from '../types/app';

export interface ActiveFullSongTrack {
  trackId?: string;
  judul: string;
  artis: string[];
  album?: string;
  sampul?: string | null;
  spotifyUrl?: string | null;
  audioStreamUrl?: string | null;
  audioMimeType?: string | null;
  audioChannel?: string | null;
  videoId?: string | null;
  videoEmbedUrl?: string | null;
  videoWatchUrl?: string | null;
  previewVideoUrl?: string | null;
  youtubeTitle?: string | null;
  youtubeChannel?: string | null;
  durasiMs?: number;
  mediaKind?: 'song' | 'podcast';
  mediaFormat?: 'audio' | 'video';
}

interface YtPlayerInstance {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YtPlayerEvent {
  data: number;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height?: string | number;
          width?: string | number;
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: YtPlayerEvent) => void;
            onError?: () => void;
          };
        }
      ) => YtPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
  }
}

interface SpotifyPlayerPanelProps {
  content: SiteContent;
  activeTrack: ActiveFullSongTrack | null;
  onCloseTrack?: () => void;
  onPlaybackPositionMs?: (positionMs: number) => void;
}

function formatSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SpotifyPlayerPanel({
  content,
  activeTrack,
  onCloseTrack,
  onPlaybackPositionMs,
}: SpotifyPlayerPanelProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hiddenYtContainerId = `efemma_hidden_audio_${reactId}`;
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const ytRef = useRef<YtPlayerInstance | null>(null);
  const loadedVideoRef = useRef<string>('');
  const positionCbRef = useRef(onPlaybackPositionMs);
  positionCbRef.current = onPlaybackPositionMs;

  const [useYtAudioFallback, setUseYtAudioFallback] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [playerError, setPlayerError] = useState('');

  const streamUrl = activeTrack?.audioStreamUrl || '';
  const activeVideoId = activeTrack?.videoId || '';
  const isVideoPodcast =
    activeTrack?.mediaKind === 'podcast' &&
    activeTrack?.mediaFormat === 'video' &&
    Boolean(activeVideoId || activeTrack?.previewVideoUrl);
  const shouldUseNativeAudio = !isVideoPodcast && Boolean(streamUrl) && !useYtAudioFallback;

  // Reset fallback flag whenever the selected track changes
  useEffect(() => {
    setUseYtAudioFallback(!isVideoPodcast && !streamUrl && Boolean(activeVideoId));
    setPlayerError('');
    setCurrentSec(0);
    setDurationSec(activeTrack?.durasiMs ? Math.round(activeTrack.durasiMs / 1000) : 0);
    setIsPlaying(false);
    setAudioLoading(!isVideoPodcast && Boolean(streamUrl));
  }, [isVideoPodcast, streamUrl, activeVideoId, activeTrack?.durasiMs, activeTrack?.judul]);

  // Native HTML5 <audio> controller
  useEffect(() => {
    const audioEl = audioElRef.current;
    if (!shouldUseNativeAudio || !audioEl || !streamUrl) {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      }
      return;
    }

    audioEl.src = streamUrl;
    audioEl.volume = volume;
    audioEl.muted = isMuted;
    audioEl.load();

    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Browser may block autoplay without direct click; user can press Play
        setAudioLoading(false);
      });
    }
  }, [shouldUseNativeAudio, streamUrl]);

  useEffect(() => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    audioEl.volume = volume;
    audioEl.muted = isMuted;
  }, [volume, isMuted]);

  // Hidden offscreen YouTube audio-only fallback ONLY if native audio stream fails/unavailable
  useEffect(() => {
    if (isVideoPodcast || shouldUseNativeAudio || !useYtAudioFallback || !activeVideoId) {
      if (ytRef.current) {
        try {
          ytRef.current.destroy();
        } catch {
          // Ignore destroy
        }
        ytRef.current = null;
        loadedVideoRef.current = '';
      }
      setYtReady(false);
      return;
    }

    let cancelled = false;
    const mountOrLoad = () => {
      if (cancelled || !window.YT?.Player) return;
      if (ytRef.current) {
        if (loadedVideoRef.current !== activeVideoId) {
          loadedVideoRef.current = activeVideoId;
          ytRef.current.loadVideoById(activeVideoId);
        }
        return;
      }

      const el = document.getElementById(hiddenYtContainerId);
      if (!el) return;

      loadedVideoRef.current = activeVideoId;
      ytRef.current = new window.YT.Player(hiddenYtContainerId, {
        width: '1',
        height: '1',
        videoId: activeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setYtReady(true);
            try {
              ytRef.current?.setVolume(Math.round(volume * 100));
              if (isMuted) ytRef.current?.mute();
              const dur = ytRef.current?.getDuration() || 0;
              if (dur > 0) setDurationSec(dur);
              ytRef.current?.playVideo();
            } catch {
              // Ignore
            }
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
            const pausedState = window.YT?.PlayerState?.PAUSED ?? 2;
            const endedState = window.YT?.PlayerState?.ENDED ?? 0;

            if (ev.data === playingState) {
              setIsPlaying(true);
              setAudioLoading(false);
              const dur = ytRef.current?.getDuration() || 0;
              if (dur > 0) setDurationSec(dur);
            } else if (ev.data === pausedState || ev.data === endedState) {
              setIsPlaying(false);
            }
          },
          onError: () => {
            if (cancelled) return;
            setPlayerError('Aliran audio lagu ini tidak dapat diputar. Coba lagu atau kueri lain.');
            setIsPlaying(false);
            setAudioLoading(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountOrLoad();
    } else {
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevReady?.();
        mountOrLoad();
      };
      if (!document.getElementById('efemma-youtube-iframe-api')) {
        const script = document.createElement('script');
        script.id = 'efemma-youtube-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [shouldUseNativeAudio, useYtAudioFallback, activeVideoId, hiddenYtContainerId]);

  useEffect(() => {
    return () => {
      if (ytRef.current) {
        try {
          ytRef.current.destroy();
        } catch {
          // Ignore unmount
        }
        ytRef.current = null;
      }
    };
  }, []);

  // Poll hidden fallback position for seekbar + LRC sync
  useEffect(() => {
    if (shouldUseNativeAudio || !useYtAudioFallback || !activeVideoId) return;
    const timer = setInterval(() => {
      if (!ytRef.current) return;
      try {
        const pos = ytRef.current.getCurrentTime?.() || 0;
        const dur = ytRef.current.getDuration?.() || 0;
        if (dur > 0) setDurationSec(dur);
        setCurrentSec(pos);
        positionCbRef.current?.(Math.round(pos * 1000));
      } catch {
        // Ignore
      }
    }, 350);
    return () => clearInterval(timer);
  }, [shouldUseNativeAudio, useYtAudioFallback, activeVideoId]);

  const handleTogglePlay = () => {
    if (shouldUseNativeAudio) {
      const audioEl = audioElRef.current;
      if (!audioEl) return;
      if (isPlaying) {
        audioEl.pause();
      } else {
        void audioEl.play().catch(() => {
          setPlayerError('Gagal memulai pemutaran audio.');
        });
      }
      return;
    }

    if (!ytRef.current) return;
    try {
      if (isPlaying) ytRef.current.pauseVideo();
      else ytRef.current.playVideo();
    } catch {
      // Ignore
    }
  };

  const handleSeek = (sec: number) => {
    setCurrentSec(sec);
    if (shouldUseNativeAudio && audioElRef.current) {
      audioElRef.current.currentTime = sec;
      positionCbRef.current?.(Math.round(sec * 1000));
    } else if (ytRef.current) {
      ytRef.current.seekTo(sec, true);
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (!shouldUseNativeAudio && ytRef.current) {
      try {
        if (nextMute) ytRef.current.mute();
        else ytRef.current.unMute();
      } catch {
        // Ignore
      }
    }
  };

  const maxSec = Math.max(
    1,
    Math.floor(durationSec || (activeTrack?.durasiMs ? activeTrack.durasiMs / 1000 : 180))
  );
  const canControl = shouldUseNativeAudio ? !audioLoading || Boolean(streamUrl) : ytReady;

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 dark:bg-emerald-950/20 space-y-3 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Disc3
            className={`h-4 w-4 shrink-0 text-emerald-500 mt-0.5 ${
              isPlaying ? 'animate-spin' : ''
            }`}
          />
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
              <span>{content.spotifyPlayerTitle}</span>
              <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                {content.spotifyPlayerBadge}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">{content.spotifyPlayerDesc}</p>
          </div>
        </div>
      </div>

      {/* Pure HTML5 Audio Engine (Zero Video) */}
      <audio
        ref={audioElRef}
        preload="auto"
        className="hidden"
        onLoadStart={() => setAudioLoading(true)}
        onCanPlay={() => setAudioLoading(false)}
        onPlaying={() => {
          setAudioLoading(false);
          setIsPlaying(true);
          setPlayerError('');
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDurationSec(d);
        }}
        onTimeUpdate={(e) => {
          const pos = e.currentTarget.currentTime || 0;
          setCurrentSec(pos);
          positionCbRef.current?.(Math.round(pos * 1000));
        }}
        onError={() => {
          setAudioLoading(false);
          if (activeVideoId && !useYtAudioFallback) {
            setUseYtAudioFallback(true);
          } else {
            setPlayerError('Gagal memuat aliran audio. Coba klik tombol Kirim Permintaan ulang.');
          }
        }}
      />

      {/* Offscreen audio-only fallback container (never displays any video frame) */}
      <div className="sr-only" aria-hidden="true">
        <div id={hiddenYtContainerId} />
      </div>

      <AnimatePresence mode="wait">
        {activeTrack && (
          <motion.div
            key={`${activeTrack.trackId || activeTrack.judul}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D1117] space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-emerald-500/15">
                  {activeTrack.sampul ? (
                    <img
                      src={activeTrack.sampul}
                      alt={activeTrack.judul}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-emerald-500">
                      <Radio className="h-5 w-5" />
                    </div>
                  )}
                  {isPlaying && (
                    <div className="absolute inset-x-0 bottom-0 flex h-4 items-end justify-center gap-0.5 bg-black/55 px-2 pb-1">
                      <span
                        className="efemma-eq-bar h-2.5 w-1 rounded-full bg-emerald-400"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="efemma-eq-bar h-3 w-1 rounded-full bg-emerald-400"
                        style={{ animationDelay: '180ms' }}
                      />
                      <span
                        className="efemma-eq-bar h-2 w-1 rounded-full bg-emerald-400"
                        style={{ animationDelay: '340ms' }}
                      />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {activeTrack.judul}
                  </div>
                  <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {activeTrack.artis.join(', ')}
                    {activeTrack.album ? ` / ${activeTrack.album}` : ''}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                    {isVideoPodcast ? (
                      <Video className="h-3 w-3 shrink-0" />
                    ) : (
                      <Headphones className="h-3 w-3 shrink-0" />
                    )}
                    <span>
                      {isVideoPodcast
                        ? 'VIDEO PODCAST STREAM'
                        : shouldUseNativeAudio
                        ? activeTrack.mediaKind === 'podcast'
                          ? 'PODCAST AUDIO-ONLY STREAM'
                          : 'AUDIO-ONLY STREAM'
                        : 'AUDIO ENGINE'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex w-full sm:w-auto flex-wrap items-center gap-2 min-w-0">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    isVideoPodcast
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isVideoPodcast
                    ? 'VIDEO PODCAST'
                    : activeTrack.mediaKind === 'podcast'
                    ? 'FULL PODCAST AUDIO'
                    : 'FULL SONG AUDIO'}
                </span>

                {!isVideoPodcast && (
                  <>
                    <button
                      type="button"
                      disabled={!canControl}
                      onClick={handleTogglePlay}
                      aria-label={isPlaying ? 'Jeda Audio' : 'Putar Audio'}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs transition-all duration-200 ease-out-expo hover:bg-emerald-500 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {audioLoading && !isPlaying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 dark:border-white/10">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        aria-label={isMuted ? 'Bunyikan Audio' : 'Bisukan Audio'}
                        className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="h-3.5 w-3.5 text-rose-500" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setVolume(val);
                          setIsMuted(val === 0);
                          if (!shouldUseNativeAudio && ytRef.current) {
                            ytRef.current.setVolume(Math.round(val * 100));
                          }
                        }}
                        aria-label="Volume Audio"
                        className="w-16 accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {isVideoPodcast && activeTrack.videoWatchUrl && (
                  <a
                    href={activeTrack.videoWatchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <Video className="h-3 w-3 text-sky-500" />
                    <span>Buka Video</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {streamUrl && (
                  <a
                    href={streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <Headphones className="h-3 w-3 text-emerald-500" />
                    <span>File Audio</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {activeTrack.spotifyUrl && (
                  <a
                    href={activeTrack.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Buka di Spotify"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                {onCloseTrack && (
                  <button
                    type="button"
                    onClick={onCloseTrack}
                    aria-label="Tutup pemutar"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {isVideoPodcast && (
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
                {activeVideoId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${encodeURIComponent(activeVideoId)}?autoplay=1&rel=0`}
                    title={activeTrack.judul}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="h-full w-full"
                  />
                ) : activeTrack.previewVideoUrl ? (
                  <video
                    src={activeTrack.previewVideoUrl}
                    controls
                    autoPlay
                    playsInline
                    poster={activeTrack.sampul || undefined}
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
            )}

            {playerError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {playerError}
              </div>
            )}

            {/* Audio Seekbar & Duration (only for audio-only playback) */}
            {!isVideoPodcast && (
              <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>{formatSec(currentSec)}</span>
                <input
                  type="range"
                  min={0}
                  max={maxSec}
                  value={Math.min(Math.floor(currentSec), maxSec)}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="flex-1 accent-emerald-500 cursor-pointer"
                />
                <span>{formatSec(maxSec)}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

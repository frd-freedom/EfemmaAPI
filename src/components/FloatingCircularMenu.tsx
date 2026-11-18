import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Compass,
  Headphones,
  HelpCircle,
  MessagesSquare,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { PageRoute, SiteContent } from '../types/app';

interface FloatingCircularMenuProps {
  currentRoute: PageRoute;
  content: SiteContent;
  onNavigate: (route: PageRoute) => void;
}

interface RadialMenuItem {
  id: 'cs' | 'faq' | 'sosmed' | 'public-chat';
  label: string;
  icon: typeof Headphones;
  accentClass: string;
}

interface BallPosition {
  x: number;
  y: number;
}

const STORAGE_POS_KEY = 'efemma_circular_hub_pos';

function getDefaultPosition(): BallPosition {
  if (typeof window === 'undefined') return { x: 320, y: 360 };
  const marginRight = window.innerWidth >= 640 ? 44 : 36;
  return {
    x: Math.max(32, window.innerWidth - marginRight),
    y: Math.max(84, Math.round(window.innerHeight / 2)),
  };
}

function clampPosition(x: number, y: number): BallPosition {
  if (typeof window === 'undefined') return { x, y };
  const minX = 32;
  const maxX = Math.max(32, window.innerWidth - 32);
  const minY = 76;
  const maxY = Math.max(76, window.innerHeight - 36);
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(x))),
    y: Math.min(maxY, Math.max(minY, Math.round(y))),
  };
}

function loadSavedPosition(): BallPosition {
  const fallback = getDefaultPosition();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_POS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BallPosition>;
    if (
      typeof parsed?.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed?.y === 'number' &&
      Number.isFinite(parsed.y)
    ) {
      return clampPosition(parsed.x, parsed.y);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function FloatingCircularMenu({
  currentRoute,
  content,
  onNavigate,
}: FloatingCircularMenuProps) {
  const [open, setOpen] = useState(false);
  const [isTrashed, setIsTrashed] = useState(false);
  const [pos, setPos] = useState<BallPosition>(() => loadSavedPosition());
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  const prefersReducedMotion = useReducedMotion();

  const dragMetaRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPos: BallPosition;
    preDragPos: BallPosition;
    moved: boolean;
    overTrash: boolean;
    latestPos: BallPosition;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setPos((prev) => clampPosition(prev.x, prev.y));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const finishDrag = useCallback(() => {
    const meta = dragMetaRef.current;
    dragMetaRef.current = null;
    if (!meta) return;

    if (meta.moved) {
      suppressNextClickRef.current = true;
      setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 150);

      if (meta.overTrash) {
        setIsTrashed(true);
        setOpen(false);
        // Keep last non-trashed position so reload restores it where it was dragged
        setPos(meta.preDragPos);
      } else {
        setPos(meta.latestPos);
        try {
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(meta.latestPos));
        } catch {
          // Ignore storage quota errors
        }
      }
    }

    setIsDragging(false);
    setHasDragged(false);
    setIsOverTrash(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const meta = dragMetaRef.current;
      if (!meta) return;

      const dx = e.clientX - meta.startClientX;
      const dy = e.clientY - meta.startClientY;

      if (!meta.moved && Math.hypot(dx, dy) > 6) {
        meta.moved = true;
        setHasDragged(true);
        setOpen(false);
      }

      if (meta.moved) {
        const nextPos = clampPosition(meta.startPos.x + dx, meta.startPos.y + dy);
        meta.latestPos = nextPos;
        setPos(nextPos);

        const trashCenterX = window.innerWidth / 2;
        const trashCenterY = window.innerHeight - 48;
        const over = Math.hypot(nextPos.x - trashCenterX, nextPos.y - trashCenterY) <= 58;
        meta.overTrash = over;
        setIsOverTrash(over);
      }
    };

    const handlePointerUp = () => {
      finishDrag();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, finishDrag]);

  const handleBallPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragMetaRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPos: pos,
      preDragPos: pos,
      moved: false,
      overTrash: false,
      latestPos: pos,
    };
    setIsDragging(true);
    setHasDragged(false);
    setIsOverTrash(false);
  };

  const handleBallClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setOpen((prev) => !prev);
  };

  const publicChatLabel = content.publicChatBadge
    ? `${content.hubPublicChatLabel || 'Public Chat'} (${content.publicChatBadge})`
    : content.hubPublicChatLabel || 'Public Chat';

  const items: RadialMenuItem[] = [
    {
      id: 'cs',
      label: content.hubCsLabel || 'Kontak CS',
      icon: Headphones,
      accentClass: 'text-sky-600 dark:text-sky-400',
    },
    {
      id: 'faq',
      label: content.hubFaqLabel || 'FAQ',
      icon: HelpCircle,
      accentClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'sosmed',
      label: content.hubSosmedLabel || 'Sosmed',
      icon: Share2,
      accentClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      id: 'public-chat',
      label: publicChatLabel,
      icon: MessagesSquare,
      accentClass: 'text-slate-700 dark:text-slate-200',
    },
  ];

  // Dynamically orient radial fan-out inward & within viewport bounds based on current ball position
  const isSmUp = viewport.w >= 640;
  const radius = isSmUp ? 98 : 86;
  const fanRight = pos.x < viewport.w / 2;
  const dirX = fanRight ? 1 : -1;

  let anglesDeg = [-62, -21, 21, 62];
  if (pos.y < 150) {
    anglesDeg = [-6, 23, 52, 82];
  } else if (pos.y > viewport.h - 140) {
    anglesDeg = [-82, -52, -23, 6];
  }

  const handleSelect = (page: RadialMenuItem['id']) => {
    setOpen(false);
    onNavigate({ page });
  };

  return (
    <>
      {/* Subtle backdrop when radial menu is open */}
      <AnimatePresence>
        {open && !isTrashed && (
          <motion.div
            key="circular-dock-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px]"
          />
        )}
      </AnimatePresence>

      {/* Trash Drop Zone shown while dragging the circular ball */}
      <AnimatePresence>
        {isDragging && hasDragged && (
          <motion.div
            key="circular-trash-zone"
            initial={{ opacity: 0, y: 24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: isOverTrash ? 1.12 : 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.85 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
            className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5"
          >
            <span
              className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full backdrop-blur-md transition-colors ${
                isOverTrash
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-900/80 text-slate-100 dark:bg-white/15 dark:text-slate-100'
              }`}
            >
              {isOverTrash ? 'Lepas untuk sembunyikan' : 'Seret ke sini untuk hapus'}
            </span>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl backdrop-blur-md transition-colors ${
                isOverTrash
                  ? 'border-rose-400 bg-rose-600 text-white'
                  : 'border-slate-300 bg-white/95 text-slate-700 dark:border-white/25 dark:bg-[#141414]/95 dark:text-slate-200'
              }`}
            >
              <Trash2 className="h-5 w-5" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Unobtrusive Restore Button when Ball is Trashed */}
      <AnimatePresence>
        {isTrashed && (
          <motion.button
            key="circular-restore-tab"
            type="button"
            onClick={() => setIsTrashed(false)}
            aria-label="Kembalikan bola menu"
            title="Kembalikan bola menu"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex items-center gap-1 rounded-l-full border border-r-0 border-slate-300 bg-white/95 py-1.5 pl-2.5 pr-2 text-[11px] font-medium text-slate-700 shadow-md backdrop-blur-md transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/15 dark:bg-[#141414]/95 dark:text-slate-200 dark:hover:bg-[#1f1f1f] dark:hover:text-white cursor-pointer"
          >
            <RotateCcw className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>Menu</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Draggable Floating Circular Dock */}
      <AnimatePresence>
        {!isTrashed && (
          <motion.div
            key="circular-dock-ball"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              left: pos.x,
              top: pos.y,
            }}
            className="fixed -translate-x-1/2 -translate-y-1/2 z-40 select-none"
            aria-label="Menu melingkar bantuan dan komunitas"
          >
            <div className="relative flex items-center justify-center">
              {/* Semicircular Arc Items */}
              <AnimatePresence>
                {open &&
                  items.map((item, idx) => {
                    const rad = (anglesDeg[idx] * Math.PI) / 180;
                    const rawX = dirX * Math.cos(rad) * radius;
                    const rawY = Math.sin(rad) * radius;

                    // Keep radial items inside safe vertical screen limits
                    const minOffsetY = 74 - pos.y;
                    const maxOffsetY = viewport.h - 34 - pos.y;
                    const y = Math.min(maxOffsetY, Math.max(minOffsetY, rawY));
                    const x = rawX;

                    const Icon = item.icon;
                    const isActive = currentRoute.page === item.id;

                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        initial={
                          prefersReducedMotion
                            ? { opacity: 0, x, y }
                            : { opacity: 0, x: 0, y: 0, scale: 0.35 }
                        }
                        animate={
                          prefersReducedMotion
                            ? { opacity: 1, x, y }
                            : { opacity: 1, x, y, scale: 1 }
                        }
                        exit={
                          prefersReducedMotion
                            ? { opacity: 0, x, y }
                            : { opacity: 0, x: 0, y: 0, scale: 0.35 }
                        }
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.15 }
                            : {
                                type: 'spring',
                                stiffness: 420,
                                damping: 26,
                                delay: idx * 0.04,
                              }
                        }
                        whileHover={prefersReducedMotion ? undefined : { scale: 1.07 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                        style={{ left: '50%', top: '50%' }}
                        className="group absolute -translate-x-1/2 -translate-y-1/2 flex items-center cursor-pointer focus-visible:outline-none"
                      >
                        {/* Label oriented dynamically inward so it never clips off screen */}
                        <span
                          className={`pointer-events-auto absolute ${
                            fanRight ? 'left-full ml-2.5' : 'right-full mr-2.5'
                          } whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-semibold shadow-md transition-colors ${
                            isActive
                              ? 'border-sky-500 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                              : 'border-slate-200 bg-white/95 text-slate-800 group-hover:border-slate-300 group-hover:text-slate-950 dark:border-white/15 dark:bg-[#141414]/95 dark:text-slate-100 dark:group-hover:border-white/30'
                          }`}
                        >
                          {item.label}
                        </span>

                        {/* Circular Icon Button */}
                        <span
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors ${
                            isActive
                              ? 'border-sky-500 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                              : 'border-slate-200 bg-white text-slate-800 group-hover:bg-slate-50 dark:border-white/15 dark:bg-[#141414] dark:text-white dark:group-hover:bg-[#1f1f1f]'
                          }`}
                        >
                          <Icon
                            className={`h-4.5 w-4.5 ${
                              isActive ? 'text-current' : item.accentClass
                            }`}
                          />
                        </span>
                      </motion.button>
                    );
                  })}
              </AnimatePresence>

              {/* Animated Orbital Ring around the Circular Trigger Button */}
              {!prefersReducedMotion && (
                <motion.svg
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                  animate={{ rotate: open ? -180 : 360 }}
                  transition={
                    open
                      ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 14, repeat: Infinity, ease: 'linear' }
                  }
                  className="pointer-events-none absolute -inset-1.5 h-[56px] w-[56px] text-sky-500/80 dark:text-sky-400/80"
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="29"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="10 8 4 8"
                    strokeLinecap="round"
                  />
                </motion.svg>
              )}

              {/* Soft Pulse Halo when Closed & Idle */}
              {!prefersReducedMotion && !open && !isDragging && (
                <motion.span
                  aria-hidden="true"
                  animate={{ scale: [1, 1.16, 1], opacity: [0.35, 0, 0.35] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute inset-0 rounded-full border border-sky-500/50 dark:border-sky-400/50"
                />
              )}

              {/* Main Draggable Circular Toggle Button */}
              <motion.button
                type="button"
                onPointerDown={handleBallPointerDown}
                onClick={handleBallClick}
                aria-expanded={open}
                aria-label={open ? 'Tutup menu melingkar' : 'Buka atau geser bola menu'}
                title="Klik untuk buka menu cepat, atau seret untuk memindahkan / hapus"
                whileHover={prefersReducedMotion || isDragging ? undefined : { scale: 1.06 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                className={`relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isOverTrash
                    ? 'border-rose-400 bg-rose-600 text-white scale-90 cursor-grabbing'
                    : isDragging
                    ? 'border-sky-400 bg-slate-800 text-white dark:bg-sky-500 dark:text-slate-950 cursor-grabbing'
                    : 'border-sky-500/35 bg-slate-900 text-white hover:bg-slate-800 dark:border-sky-400/35 dark:bg-[#141923]/95 dark:text-sky-300 dark:hover:bg-[#1b2333] cursor-grab'
                }`}
              >
                <motion.span
                  animate={{ rotate: open ? 90 : 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-center"
                >
                  {open ? <X className="h-4.5 w-4.5" /> : <Compass className="h-4.5 w-4.5" />}
                </motion.span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

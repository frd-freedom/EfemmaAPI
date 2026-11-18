import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let rafId = 0;
    const updateVisibility = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const isBodyLocked = document.body.style.position === 'fixed';
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const next = !isBodyLocked && y > 120;
        setVisible((prev) => (prev === next ? prev : next));
      });
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="floating-scroll-top"
          type="button"
          onClick={handleScrollToTop}
          aria-label="Kembali ke paling atas"
          title="Kembali ke paling atas"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="fixed bottom-5 right-4 sm:right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-500/35 bg-sky-600 text-white shadow-md transition-colors hover:bg-sky-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-400/35 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
        >
          <ArrowUp className="h-4.5 w-4.5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

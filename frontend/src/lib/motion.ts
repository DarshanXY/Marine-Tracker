/**
 * Shared motion vocabulary — one source of truth for entrance/scroll/route
 * animation across the marketing site and the app shell, so every page moves
 * with the same calm "sunlit ocean" cadence instead of ad-hoc per-file variants.
 *
 * Reduced motion is honoured globally by wrapping the app in
 * <MotionConfig reducedMotion="user"> (see App.tsx) — these variants only animate
 * opacity/transform, which MotionConfig automatically flattens for users who ask
 * for less motion. No per-call guards needed.
 */
import type { Variants } from 'framer-motion';

/** Calm ease-out (a soft overshoot-free curve) used for almost everything. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + rise. The default child of a staggered container. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Plain fade — for text blocks where vertical motion would feel busy. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

/** Gentle scale-up — for cards, badges, hero media. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: EASE } },
};

/** A container whose children animate in sequence. Pair with fadeUp/scaleIn on
 *  each child and drive with initial="hidden" + whileInView="show". */
export const staggerContainer = (stagger = 0.07, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

/** Spread onto a `motion` element for a one-shot fade+rise as it scrolls into
 *  view: `<motion.div {...reveal(0.05)} />`. Self-contained (no variants needed). */
export const reveal = (delay = 0, y = 22) => ({
  initial: { opacity: 0, y },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: EASE, delay },
});

/** Route/page transition applied to the shell <Outlet/> (keyed by pathname
 *  inside <AnimatePresence mode="wait">). Short + subtle so navigation stays snappy. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } },
};

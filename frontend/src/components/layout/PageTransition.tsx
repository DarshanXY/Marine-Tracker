import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';
import { pageTransition } from '@/lib/motion';

/**
 * Wraps the routed <Outlet/> so each page fades/rises in and out on navigation,
 * while the surrounding shell (header / sidebar) stays put. Keyed by pathname;
 * `mode="wait"` lets the outgoing page finish its exit before the next enters.
 * Reduced-motion users get an instant swap via the app-level <MotionConfig>.
 */
export function PageTransition() {
  const { pathname } = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageTransition}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

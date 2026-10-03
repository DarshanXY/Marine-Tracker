import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LEVEL, type UserRole } from '@/types';

/**
 * Role gate for a group of /app routes. Hiding a nav link (AppLayout) is only
 * cosmetic — without this, typing the URL still renders the page. This blocks
 * that path: an under-privileged user is bounced back to /app with a toast,
 * an unauthenticated one to /login. Sits INSIDE <ProtectedRoute> (auth is
 * already guaranteed), so this only decides clearance.
 */
export function RequireRole({ minRole }: { minRole: UserRole }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const allowed = !!user && ROLE_LEVEL[user.role] >= ROLE_LEVEL[minRole];

  useEffect(() => {
    if (user && !allowed) {
      toast.error(`That page requires the ${minRole} role or higher.`);
    }
  }, [user, allowed, minRole]);

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!allowed) return <Navigate to="/app" replace />;
  return <Outlet />;
}

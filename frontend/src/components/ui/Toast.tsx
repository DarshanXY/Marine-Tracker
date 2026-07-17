/**
 * Toast — thin wrappers around react-hot-toast.
 * The Toaster provider is mounted in App.tsx.
 * Import these helpers anywhere to fire a notification.
 */
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

const iconSize = 16;

function makeIcon(icon: ReactNode) {
  return <span className="flex-shrink-0">{icon}</span>;
}

export const Toast = {
  success(message: string, opts?: Parameters<typeof toast>[1]) {
    return toast.success(message, {
      icon: makeIcon(<CheckCircle2 size={iconSize} className="text-success-500" />),
      ...opts,
    });
  },

  error(message: string, opts?: Parameters<typeof toast>[1]) {
    return toast.error(message, {
      icon: makeIcon(<XCircle size={iconSize} className="text-danger" />),
      ...opts,
    });
  },

  warn(message: string, opts?: Parameters<typeof toast>[1]) {
    return toast(message, {
      icon: makeIcon(<AlertTriangle size={iconSize} className="text-warn" />),
      ...opts,
    });
  },

  info(message: string, opts?: Parameters<typeof toast>[1]) {
    return toast(message, {
      icon: makeIcon(<Info size={iconSize} className="text-ocean-600" />),
      ...opts,
    });
  },

  loading(message: string, opts?: Parameters<typeof toast>[1]) {
    return toast.loading(message, {
      icon: makeIcon(<Loader2 size={iconSize} className="animate-spin text-ocean-600" />),
      ...opts,
    });
  },

  dismiss: toast.dismiss,
  promise: toast.promise,
};

export { toast as rawToast };

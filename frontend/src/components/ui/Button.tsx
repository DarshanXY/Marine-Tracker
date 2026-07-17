import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-ocean-600 text-white border border-ocean-500/30 hover:bg-ocean-800 shadow-glow-primary/20',
  secondary: 'bg-ocean-100 text-ocean-800 border border-ocean-200 hover:bg-ocean-200',
  outline:   'bg-transparent text-ocean-600 border border-ocean-400 hover:bg-ocean-50 hover:border-ocean-600',
  ghost:     'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100',
  danger:    'bg-red-500 text-white border border-red-400/30 hover:bg-red-600',
  success:   'bg-success-500 text-white border border-success-400/30 hover:bg-success-700',
};

const sizeClasses: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
};

const iconSize: Record<Size, number> = { xs: 11, sm: 12, md: 14, lg: 16 };

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      whileHover={isDisabled ? {} : { scale: 1.02 }}
      whileTap={isDisabled ? {} : { scale: 0.97 }}
      className={cn(
        'inline-flex items-center justify-center font-body font-medium',
        'transition-all duration-200 select-none',
        'btn-shimmer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={isDisabled}
      {...(props as object)}
    >
      {loading ? (
        <Loader2 size={iconSize[size]} className="animate-spin flex-shrink-0" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}

      {children}

      {!loading && iconRight && (
        <span className="flex-shrink-0">{iconRight}</span>
      )}
    </motion.button>
  );
}

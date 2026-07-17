import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  icon?: ReactNode;
  trend?: number;          // % change, positive = up, negative = down
  trendLabel?: string;     // e.g. "vs last month"
  color?: 'ocean' | 'success' | 'warn' | 'danger' | 'purple';
  animate?: boolean;
  className?: string;
  delay?: number;          // stagger delay in seconds
}

const colorMap = {
  ocean:   { icon: 'bg-ocean-100 text-ocean-600',   value: 'text-ocean-700',   glow: 'shadow-glow-primary' },
  success: { icon: 'bg-success-100 text-success-600', value: 'text-success-700', glow: 'shadow-glow-success' },
  warn:    { icon: 'bg-amber-100 text-amber-600',    value: 'text-amber-700',   glow: '' },
  danger:  { icon: 'bg-red-100 text-red-600',        value: 'text-red-700',     glow: 'shadow-glow-danger' },
  purple:  { icon: 'bg-purple-100 text-purple-600',  value: 'text-purple-700',  glow: '' },
};

function useCountUp(target: number, duration = 1200, active = true) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || typeof target !== 'number') { setCount(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, active]);

  return count;
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  trendLabel,
  color = 'ocean',
  animate = true,
  className,
  delay = 0,
}: StatCardProps) {
  const numericValue = typeof value === 'number' ? value : null;
  const displayCount = useCountUp(numericValue ?? 0, 1200, animate && numericValue !== null);

  const { icon: iconClass, value: valueClass } = colorMap[color];

  const TrendIcon = trend === undefined ? null
    : trend > 0 ? TrendingUp
    : trend < 0 ? TrendingDown
    : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: 'easeOut' }}
      whileHover={{ y: -4, boxShadow: '0 24px 80px rgba(13,148,136,0.15)' }}
      className={cn('glass card-accent relative p-5', className)}
    >
      {/* Icon + trend row */}
      <div className="flex items-start justify-between mb-4">
        {icon && (
          <div className={cn('p-2.5 rounded-xl flex-shrink-0', iconClass)}>
            {icon}
          </div>
        )}

        {TrendIcon && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-semibold font-body rounded-full px-2 py-1',
              trend! > 0 ? 'bg-success-100 text-success-700' : trend! < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500',
            )}
          >
            <TrendIcon size={11} />
            <span>{Math.abs(trend!)}%</span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className={cn('font-display font-bold text-3xl leading-none mb-1', valueClass)}>
        {numericValue !== null ? (
          <>
            {displayCount.toLocaleString('en-IN')}
            {unit && <span className="text-base ml-1 font-mono">{unit}</span>}
          </>
        ) : (
          <span>{value}</span>
        )}
      </div>

      {/* Label */}
      <p className="text-sm text-slate-500 font-body mt-1">{label}</p>

      {trendLabel && (
        <p className="text-xs text-slate-400 font-body mt-0.5">{trendLabel}</p>
      )}
    </motion.div>
  );
}

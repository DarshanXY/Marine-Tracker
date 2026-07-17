import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Toolbar content (filters, download button, etc.) */
  toolbar?: ReactNode;
  /** Footer content (legend, notes, etc.) */
  footer?: ReactNode;
  /** Height of the chart area */
  chartHeight?: number;
  loading?: boolean;
  accent?: boolean;
  className?: string;
  delay?: number;
}

export function ChartCard({
  title,
  subtitle,
  children,
  toolbar,
  footer,
  chartHeight = 240,
  loading = false,
  accent = true,
  className,
  delay = 0,
}: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: 'easeOut' }}
      className={cn('glass relative flex flex-col gap-4', accent && 'card-accent', className)}
      style={{ padding: '20px' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-800 tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-400 font-body">{subtitle}</p>
          )}
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>

      {/* Chart area */}
      <div style={{ height: chartHeight }}>
        {loading ? (
          <div className="flex flex-col justify-end gap-2 h-full">
            {[60, 80, 50, 90, 70].map((h, i) => (
              <Skeleton key={i} className="w-full" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="pt-3 border-t border-border/60 text-xs text-slate-400 font-body">
          {footer}
        </div>
      )}
    </motion.div>
  );
}

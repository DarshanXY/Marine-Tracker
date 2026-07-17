import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface Breadcrumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn('flex flex-col gap-3', className)}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />}
              {crumb.href || crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="text-xs font-body text-slate-400 hover:text-ocean-600 transition-colors duration-150"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-xs font-body text-slate-500">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight truncate">
            {title}
          </h1>
          {badge}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {subtitle && (
        <p className="text-sm text-slate-500 font-body leading-relaxed">{subtitle}</p>
      )}

      {/* Decorative separator */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-ocean-200 via-ocean-100 to-transparent"
      />
    </motion.div>
  );
}

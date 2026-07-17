import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ButtonProps & { label: string };
  secondaryAction?: ButtonProps & { label: string };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-16 px-8 rounded-glass border border-border/60',
        className,
      )}
    >
      {icon && (
        <div className="mb-5 p-4 rounded-2xl bg-ocean-50 text-ocean-400">
          {icon}
        </div>
      )}

      <h3 className="font-display text-base font-semibold text-slate-800 mb-2">{title}</h3>

      {description && (
        <p className="text-sm text-slate-500 font-body max-w-sm leading-relaxed mb-6">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex gap-3 flex-wrap justify-center">
          {action && (
            <Button variant="primary" {...action}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" {...secondaryAction}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

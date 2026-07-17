import { type HTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the 3px teal→cyan→green top accent bar */
  accent?: boolean;
  /** Lifts on hover with an elevated shadow */
  hoverable?: boolean;
  /** Adds corner-bracket "targeting reticle" accents */
  reticle?: boolean;
  /** Padding preset */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingClasses = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
};

export function Card({
  accent = false,
  hoverable = false,
  reticle = false,
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  const base = cn(
    'glass relative',
    accent && 'card-accent',
    reticle && 'reticle',
    paddingClasses[padding],
    className,
  );

  if (hoverable) {
    return (
      <motion.div
        className={base}
        whileHover={{
          y: -4,
          boxShadow: '0 24px 80px rgba(13,148,136,0.15), 0 8px 24px rgba(0,0,0,0.08)',
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        {...(props as object)}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={base} {...props}>
      {children}
    </div>
  );
}

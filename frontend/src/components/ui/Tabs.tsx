import { type ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  badge?: number | string;
}

export interface TabsProps {
  items: TabItem[];
  activeKey?: string;
  onChange?: (key: string) => void;
  /** Variant changes visual style of the tab bar */
  variant?: 'line' | 'pill' | 'card';
  className?: string;
  children?: ReactNode;
}

export function Tabs({
  items,
  activeKey: controlledKey,
  onChange,
  variant = 'line',
  className,
  children,
}: TabsProps) {
  const [internalKey, setInternalKey] = useState(items[0]?.key ?? '');
  const active = controlledKey ?? internalKey;
  const getTabId = (key: string) => `tab-${key}`;
  const getPanelId = (key: string) => `tab-panel-${key}`;

  const handleChange = (key: string) => {
    setInternalKey(key);
    onChange?.(key);
  };

  const containerClass = {
    line: 'flex border-b border-border',
    pill: 'flex gap-1 p-1 bg-slate-100 rounded-xl',
    card: 'flex gap-2',
  }[variant];

  const tabClass = (key: string, disabled?: boolean) =>
    cn(
      'inline-flex items-center gap-2 font-body font-medium transition-all duration-200 text-sm',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-600',
      disabled && 'opacity-40 cursor-not-allowed pointer-events-none',

      // Line variant
      variant === 'line' && [
        'px-4 py-2.5 -mb-px border-b-2',
        active === key
          ? 'border-ocean-600 text-ocean-700'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
      ],

      // Pill variant
      variant === 'pill' && [
        'px-4 py-1.5 rounded-lg',
        active === key
          ? 'bg-white text-ocean-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-700',
      ],

      // Card variant
      variant === 'card' && [
        'px-5 py-2.5 rounded-t-xl border border-border',
        active === key
          ? 'bg-white text-ocean-700 border-b-white -mb-px z-10'
          : 'bg-slate-50 text-slate-500 hover:bg-white/70',
      ],
    );

  return (
    <div className={cn('flex flex-col', className)}>
      <div role="tablist" className={containerClass} aria-label="Tabs">
        {items.map(item => (
          <button
            key={item.key}
            id={getTabId(item.key)}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            aria-controls={getPanelId(item.key)}
            disabled={item.disabled}
            onClick={() => !item.disabled && handleChange(item.key)}
            className={tabClass(item.key, item.disabled)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  'ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold leading-none',
                  active === item.key
                    ? 'bg-ocean-100 text-ocean-700'
                    : 'bg-slate-200 text-slate-500',
                )}
              >
                {item.badge}
              </span>
            )}
            {/* Animated underline indicator for 'line' variant */}
            {variant === 'line' && active === item.key && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-ocean-600 rounded-full"
                style={{ position: 'absolute' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Children slot — only shown for controlled usage */}
      {children && (
        <div
          role="tabpanel"
          id={getPanelId(active)}
          aria-labelledby={getTabId(active)}
          className="mt-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}

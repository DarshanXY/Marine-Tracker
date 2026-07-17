import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, fullWidth = true, className, id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-slate-700 font-body"
          >
            {label}
            {props.required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}

        <div
          className={cn(
            'flex items-center gap-2 px-3',
            'bg-white/80 border rounded-xl transition-all duration-200',
            'input-glow',
            error
              ? 'border-danger ring-1 ring-danger/20'
              : 'border-border hover:border-ocean-400 focus-within:border-ocean-500',
            props.disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
          )}
        >
          {prefix && (
            <span className="flex-shrink-0 text-slate-400">{prefix}</span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex-1 py-2.5 bg-transparent font-body text-sm text-slate-800',
              'placeholder:text-slate-400 outline-none',
              'disabled:cursor-not-allowed',
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />

          {suffix && (
            <span className="flex-shrink-0 text-slate-400">{suffix}</span>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-danger font-body">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-xs text-slate-400 font-body">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

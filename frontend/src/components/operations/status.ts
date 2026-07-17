/** Shared display metadata + transition rules for field operations. */
import type { BadgeProps } from '@/components';
import type { OperationOutcome, OperationStatus } from '@/types';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export const STATUS_META: Record<OperationStatus, { label: string; variant: BadgeVariant }> = {
  PLANNED:     { label: 'Planned',     variant: 'neutral' },
  DISPATCHED:  { label: 'Dispatched',  variant: 'ocean' },
  IN_PROGRESS: { label: 'In progress', variant: 'warn' },
  COMPLETED:   { label: 'Completed',   variant: 'success' },
  CANCELLED:   { label: 'Cancelled',   variant: 'neutral' },
};

export const STATUS_ORDER: OperationStatus[] = [
  'PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
];

export const OUTCOME_OPTIONS: { value: OperationOutcome; label: string }[] = [
  { value: 'CLEARED', label: 'Cleared — debris removed' },
  { value: 'PARTIAL', label: 'Partial — some recovered' },
  { value: 'NOT_FOUND', label: 'Not found — nothing on site' },
  { value: 'STOOD_DOWN', label: 'Stood down — not actioned' },
];

/** The forward status a card can advance to (absent = terminal / file a report). */
export const NEXT_STATUS: Partial<Record<OperationStatus, OperationStatus>> = {
  PLANNED: 'DISPATCHED',
  DISPATCHED: 'IN_PROGRESS',
};

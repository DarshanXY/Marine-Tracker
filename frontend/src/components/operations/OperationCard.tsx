/** One field operation as a card, with context-aware actions for managers. */
import { FileDown, Flag, MapPin, PlayCircle, Send, Users, XCircle } from 'lucide-react';
import { Card, Badge, Button, SeverityPill } from '@/components';
import { formatCoords } from '@/lib/utils';
import { NEXT_STATUS, STATUS_META } from './status';
import type { Operation, OperationStatus } from '@/types';

export function OperationCard({
  operation,
  canManage,
  busy = false,
  onAdvance,
  onFileReport,
  onExport,
}: {
  operation: Operation;
  canManage: boolean;
  busy?: boolean;
  onAdvance: (next: OperationStatus) => void;
  onFileReport: () => void;
  onExport: () => void;
}) {
  const o = operation;
  const meta = STATUS_META[o.status];
  const next = NEXT_STATUS[o.status];
  const terminal = o.status === 'COMPLETED' || o.status === 'CANCELLED';

  return (
    <Card accent className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-slate-400">{o.code}</span>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <SeverityPill severity={o.priority} />
          </div>
          <p className="mt-1.5 font-display text-sm font-semibold text-slate-800">{o.title}</p>
        </div>
        <Button variant="ghost" size="xs" icon={<FileDown size={12} />} onClick={onExport} title="Download mission dossier (PDF)">
          PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {o.regionCode && (
          <span className="inline-flex items-center gap-1"><MapPin size={12} /> {o.regionCode}</span>
        )}
        {o.targetLat != null && o.targetLon != null && (
          <span className="font-mono text-slate-400">{formatCoords(o.targetLat, o.targetLon)}</span>
        )}
        {o.assignedTeam && (
          <span className="inline-flex items-center gap-1"><Users size={12} /> {o.assignedTeam}</span>
        )}
      </div>

      {o.report && (
        <div className="rounded-lg bg-slate-50/70 px-2.5 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Report · {o.report.outcome.replace('_', ' ')}</span>
          {o.report.plasticCollectedKg != null && <> · {o.report.plasticCollectedKg} kg collected</>}
          {o.report.areaClearedSqKm != null && <> · {o.report.areaClearedSqKm} km² cleared</>}
        </div>
      )}

      {canManage && !terminal && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {next && (
            <Button
              size="xs"
              variant="outline"
              loading={busy}
              icon={next === 'DISPATCHED' ? <Send size={12} /> : <PlayCircle size={12} />}
              onClick={() => onAdvance(next)}
            >
              {next === 'DISPATCHED' ? 'Dispatch' : 'Start'}
            </Button>
          )}
          <Button size="xs" variant="primary" icon={<Flag size={12} />} onClick={onFileReport}>
            File report
          </Button>
          <Button size="xs" variant="ghost" icon={<XCircle size={12} />} onClick={() => onAdvance('CANCELLED')}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

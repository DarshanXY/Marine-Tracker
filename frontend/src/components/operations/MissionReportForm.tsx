/** File-mission-report modal — closes out an operation with an after-action record. */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select } from '@/components';
import { useFileMissionReport } from '@/hooks/useApi';
import { OUTCOME_OPTIONS } from './status';
import type { FileReportInput, Operation, OperationOutcome } from '@/types';

export function MissionReportForm({
  open,
  onClose,
  operation,
}: {
  open: boolean;
  onClose: () => void;
  operation: Operation | null;
}) {
  const file = useFileMissionReport();
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState<OperationOutcome>('CLEARED');
  const [plastic, setPlastic] = useState('');
  const [area, setArea] = useState('');
  const [team, setTeam] = useState('');
  const [photos, setPhotos] = useState('');

  const reset = () => {
    setSummary(''); setOutcome('CLEARED'); setPlastic(''); setArea(''); setTeam(''); setPhotos('');
  };

  const submit = async () => {
    if (!operation) return;
    if (!summary.trim()) {
      toast.error('Add a short summary of what happened.');
      return;
    }
    const input: FileReportInput = {
      summary: summary.trim(),
      outcome,
      plasticCollectedKg: plastic ? Number(plastic) : null,
      areaClearedSqKm: area ? Number(area) : null,
      teamSize: team ? Number(team) : null,
      photosCount: photos ? Number(photos) : 0,
    };
    try {
      await file.mutateAsync({ id: operation.id, input });
      toast.success('Mission report filed — operation marked complete.');
      reset();
      onClose();
    } catch {
      toast.error('Could not file the report — check your clearance.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={operation ? `File mission report — ${operation.code}` : 'File mission report'}
      description="Records the after-action outcome and completes the operation."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={file.isPending} onClick={submit}>File report</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Input label="Summary" required value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What did the crew find and recover?" />
        <Select label="Outcome" options={OUTCOME_OPTIONS} value={outcome} onChange={(v) => setOutcome(v as OperationOutcome)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Plastic collected (kg)" type="number" value={plastic} onChange={(e) => setPlastic(e.target.value)} placeholder="340" />
          <Input label="Area cleared (km²)" type="number" value={area} onChange={(e) => setArea(e.target.value)} placeholder="0.6" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Team size" type="number" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="6" />
          <Input label="Photos attached" type="number" value={photos} onChange={(e) => setPhotos(e.target.value)} placeholder="12" />
        </div>
      </div>
    </Modal>
  );
}

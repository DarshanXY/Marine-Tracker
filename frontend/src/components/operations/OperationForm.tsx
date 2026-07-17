/** Create-operation modal — dispatch a crew against a hotspot/detection. */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select } from '@/components';
import { useCreateOperation } from '@/hooks/useApi';
import type { CreateOperationInput, Severity } from '@/types';

const REGION_OPTIONS = [
  { value: '', label: 'None / open sea' },
  { value: 'MUM', label: 'MUM — Mumbai Coast' },
  { value: 'GOA', label: 'GOA — Goa Coastline' },
  { value: 'KCH', label: 'KCH — Kochi' },
  { value: 'CHN', label: 'CHN — Chennai' },
  { value: 'AND', label: 'AND — Andaman & Nicobar' },
];

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export interface OperationPrefill {
  title?: string;
  priority?: Severity;
  regionCode?: string | null;
  hotspotId?: string | null;
  detectionId?: string | null;
  targetLat?: number | null;
  targetLon?: number | null;
}

export function OperationForm({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: OperationPrefill;
}) {
  const create = useCreateOperation();
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [priority, setPriority] = useState<Severity>(prefill?.priority ?? 'MEDIUM');
  const [region, setRegion] = useState(prefill?.regionCode ?? '');
  const [team, setTeam] = useState('');
  const [lat, setLat] = useState(prefill?.targetLat != null ? String(prefill.targetLat) : '');
  const [lon, setLon] = useState(prefill?.targetLon != null ? String(prefill.targetLon) : '');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setTitle(''); setPriority('MEDIUM'); setRegion(''); setTeam(''); setLat(''); setLon(''); setNotes('');
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error('Give the operation a title.');
      return;
    }
    const input: CreateOperationInput = {
      title: title.trim(),
      priority,
      regionCode: region || null,
      hotspotId: prefill?.hotspotId ?? null,
      detectionId: prefill?.detectionId ?? null,
      targetLat: lat ? Number(lat) : null,
      targetLon: lon ? Number(lon) : null,
      assignedTeam: team.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      await create.mutateAsync(input);
      toast.success('Operation created.');
      reset();
      onClose();
    } catch {
      toast.error('Could not create — sign in with field clearance (cg_officer / field_analyst / admin).');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New field operation"
      description="Dispatch a crew against a hotspot or detection and track it to a filed mission report."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={create.isPending} onClick={submit}>Create operation</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mumbai coast — HIGH debris sweep" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Priority" options={PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority(v as Severity)} />
          <Select label="Region" options={REGION_OPTIONS} value={region} onChange={setRegion} />
        </div>
        <Input label="Assigned team / vessel" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. ICG vessel Samudra + shore crew" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Target latitude" type="number" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.02" />
          <Input label="Target longitude" type="number" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="72.81" />
        </div>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, tasking, constraints…" />
      </div>
    </Modal>
  );
}

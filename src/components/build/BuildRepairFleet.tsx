import { useRef, useState } from 'react';
import { Button } from '../../design-system';
import { localBuilds } from '../../kit/buildRecords';
import type { BuildRepairRecord } from '../../kit/buildRepairTypes';
import { buildEvidenceFragment } from '../../fleet/buildReference';
import { fleetAddress, savedFleetAddress } from '../../fleet/openFleet';

export function BuildRepairFleet({ repair, onChanged, onError }: {
  repair: BuildRepairRecord; onChanged: () => void; onError: (error: unknown) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const open = () => {
    const address = fleetAddress(savedFleetAddress());

    if (address) window.open(`${address}/fleet#${buildEvidenceFragment({ build: repair.build, repair: repair.id, source: repair.source, target: repair.target })}`, '_blank', 'noopener');
  };
  const read = async (file: File | undefined) => {
    if (!file || busy) return;

    setBusy(true);

    try {
      if (file.size > 4096) throw new Error('Choose a Fleet build reference.');

      await localBuilds.linkRepairFleet({ id: repair.build, repair: repair.id, reference: JSON.parse(await file.text()) });
      onChanged();
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  };

  return <div className="space-y-2">
    {repair.fleet && <div className="text-[12px] break-all">{repair.fleet.organization} / {repair.fleet.robot}</div>}
    <Button fullWidth onClick={open}>Link Fleet Robot</Button>
    <Button fullWidth disabled={busy} onClick={() => input.current?.click()}>Import Fleet Reference</Button>
    <input className="hidden" ref={input} type="file" accept="application/json,.json" aria-label="Fleet reference" onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ''; }} />
  </div>;
}

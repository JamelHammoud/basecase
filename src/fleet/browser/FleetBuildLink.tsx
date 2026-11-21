import { useState } from 'react';
import { Button } from '../../design-system';
import { downloadBytes } from '../../utils/downloadBytes';
import type { FleetBuildEvidence } from '../buildReference';
import { linkBuildReference } from './buildReference';

export function FleetBuildLink({ org, robot, evidence }: { org: string; robot: string; evidence: FleetBuildEvidence }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = async () => {
    if (busy) return;

    setBusy(true);
    setError('');

    try {
      const reference = await linkBuildReference(org, robot, evidence);

      downloadBytes(
        new TextEncoder().encode(JSON.stringify(reference)),
        'fleet-build-reference.json',
        'application/json',
      );
    } catch {
      setError('Fleet request refused');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button disabled={busy} onClick={() => void link()}>
        Link Build
      </Button>
      {error && <div role="alert">{error}</div>}
    </div>
  );
}

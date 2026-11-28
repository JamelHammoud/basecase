import { useLayoutEffect, useState } from 'react';
import { ImportActivation } from '../roboflow/importActivation';
import type { RoboflowContinuation, RoboflowPending } from '../roboflow/roboflowBridge';

export type PrepareRoboflow = (
  input: string | RoboflowContinuation,
  active: () => boolean,
) => Promise<RoboflowPending | null>;

export function useRoboflowPreparation(prepare: PrepareRoboflow, onClose: () => void) {
  const [activation] = useState(() => new ImportActivation());
  const [pending, setPending] = useState<RoboflowPending | null>(null);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => () => activation.cancel(), [activation]);

  const close = () => {
    activation.cancel();
    setPending(null);
    setBusy(false);
    onClose();
  };

  const submit = async (link: string) => {
    if (busy) return;

    const active = activation.start();

    setBusy(true);

    const reply = await prepare(pending?.continuation ?? link, active);

    if (!active()) return;

    setBusy(false);
    setPending(reply);

    if (!reply) close();
  };

  return { pending, busy, close, submit };
}

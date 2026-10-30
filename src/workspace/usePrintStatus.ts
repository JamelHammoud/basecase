import { useEffect, useEffectEvent, useState } from 'react';
import type { PrinterSetup } from '../data/printers';
import { printBridge, type PrinterStatus } from '../print/printBridge';
import { updateRecord } from '../print/tracker';
import type { PrintRecord } from '../types/robotics';

const POLL_MS = 5000;

const NEXT_STATE: Partial<Record<PrinterStatus['state'], PrintRecord['state']>> = {
  preparing: 'printing',
  printing: 'printing',
  paused: 'printing',
  finished: 'printed',
  failed: 'failed',
};

interface StatusOptions {
  printer: PrinterSetup;
  records: PrintRecord[];
  setRecords: (update: (prev: PrintRecord[]) => PrintRecord[]) => void;
  active: boolean;
}

export function usePrintStatus({ printer, records, setRecords, active }: StatusOptions) {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const id = printer.mine?.connection && printer.mine.connection.kind !== 'bambu-studio' ? printer.mine.id : null;
  const open = records.find((r) => r.printer === printer.label && (r.state === 'sent' || r.state === 'printing'));
  const polling = !!id && (active || !!open);

  const apply = useEffectEvent((next: PrinterStatus | null) => {
    setStatus(next);

    const state = next && NEXT_STATE[next.state];

    if (!open || !state || state === open.state) return;

    setRecords((prev) => updateRecord(prev, open.id, { state }));
  });

  useEffect(() => {
    if (!polling || !id) return;

    let stopped = false;

    const tick = async () => {
      try {
        const next = await printBridge.printerStatus(id);

        if (!stopped) apply(next);
      } catch {
        if (!stopped) apply({ state: 'offline' });
      }
    };

    void tick();

    const timer = window.setInterval(tick, POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [polling, id]);

  return polling ? status : null;
}

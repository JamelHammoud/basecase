import { useEffect, useEffectEvent, useState } from 'react';
import type { MyPrinter } from '../data/printers';
import { printBridge, type PrinterStatus } from '../print/printBridge';
import { updateRecord } from '../print/tracker';
import type { PrintRecord } from '../types/robotics';
import { allocatePurchase } from '../components/build/usePurchases';

const POLL_MS = 5000;

const NEXT_STATE: Partial<Record<PrinterStatus['state'], PrintRecord['state']>> = {
  preparing: 'printing',
  printing: 'printing',
  paused: 'printing',
  finished: 'printed',
  failed: 'failed',
};

interface StatusOptions {
  printers: MyPrinter[];
  records: PrintRecord[];
  setRecords: (update: (prev: PrintRecord[]) => PrintRecord[]) => void;
  active: boolean;
  onError: (error: unknown) => void;
}

export const reportsStatus = (printer: MyPrinter) => !!printer.connection && printer.connection.kind !== 'bambu-studio';

const openRecord = (records: PrintRecord[], printer: MyPrinter) =>
  records.find((r) => r.printer === printer.nickname && (r.state === 'sent' || r.state === 'printing'));

export function usePrintStatus({ printers, records, setRecords, active, onError }: StatusOptions) {
  const [statuses, setStatuses] = useState<Record<string, PrinterStatus | null>>({});
  const polled = printers.filter((p) => reportsStatus(p) && (active || !!openRecord(records, p)));
  const ids = polled.map((p) => p.id).join('\n');

  const apply = useEffectEvent((id: string, next: PrinterStatus | null) => {
    setStatuses((prev) => (JSON.stringify(prev[id]) === JSON.stringify(next) ? prev : { ...prev, [id]: next }));

    const printer = printers.find((p) => p.id === id);
    const open = printer && openRecord(records, printer);
    const state = next && NEXT_STATE[next.state];

    if (!open || !state || state === open.state) return;

    const completion =
      state === 'printed' ? { ...open.completion, reportedAt: new Date().toISOString() } : open.completion;
    const record = { ...open, state, completion };

    void allocatePurchase({ kind: 'print', record })
      .then(() => setRecords((prev) => updateRecord(prev, open.id, { state, completion })))
      .catch(onError);
  });

  useEffect(() => {
    if (!ids) return;

    let stopped = false;

    const poll = async (id: string) => {
      try {
        const next = await printBridge.printerStatus(id);

        if (!stopped) apply(id, next);
      } catch {
        if (!stopped) apply(id, { state: 'offline' });
      }
    };
    const tick = () => ids.split('\n').forEach((id) => void poll(id));

    tick();

    const timer = window.setInterval(tick, POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [ids]);

  return Object.fromEntries(polled.map((p) => [p.id, statuses[p.id] ?? null]));
}

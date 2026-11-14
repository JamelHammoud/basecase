import React, { useState } from 'react';
import { Button, ConfirmDialog, MetaLine } from '../../design-system';
import { printBridge, type PrinterStatus } from '../../print/printBridge';
import type { Printing } from '../../workspace/usePrinting';
import { duration } from '../../utils/duration';
import { percent } from '../../../electron/percent.mjs';
import { PRINTER_STATE_TEXT } from './plateFacts';
import { showsFleet } from './PrinterFleet';

function facts(status: PrinterStatus) {
  return [
    status.progress !== undefined && percent(status.progress),
    status.layer && status.totalLayers && `Layer ${status.layer} of ${status.totalLayers}`,
    status.remainingMin !== undefined && `${duration(status.remainingMin * 60, 'min')} left`,
  ];
}

export const PrinterLive: React.FC<{ printing: Printing }> = ({ printing }) => {
  const [confirm, setConfirm] = useState(false);
  const status = printing.status;
  const id = printing.printer.mine?.id;

  if (!status || !id || (status.state === 'idle' && showsFleet(printing))) return null;

  const control = (action: 'pause' | 'resume' | 'cancel') => () =>
    void printBridge.control(id, action).catch((e: unknown) => console.warn(e));
  const running = status.state === 'printing' || status.state === 'preparing';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[13px] text-white/90">
        {PRINTER_STATE_TEXT[status.state]}
        {status.job && <span className="text-white/50"> {status.job}</span>}
      </div>
      <MetaLine className="text-[12.5px] text-white/50 tabular-nums" items={facts(status)} />
      {status.progress !== undefined && running && (
        <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0d99ff]"
            style={{ width: `${Math.round(status.progress * 100)}%` }}
          />
        </div>
      )}
      {status.message && <div className="text-[12.5px] text-amber-400">{status.message}</div>}
      {(running || status.state === 'paused') && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={control(running ? 'pause' : 'resume')}>
            {running ? 'Pause' : 'Resume'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Stop Print
          </Button>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirm}
        title={`Stop the print on ${printing.printer.label}?`}
        confirmLabel="Stop Print"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          control('cancel')();
        }}
      >
        The part on the bed can’t be resumed.
      </ConfirmDialog>
    </div>
  );
};

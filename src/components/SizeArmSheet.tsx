import React, { useState } from 'react';
import { FieldRow, Modal, NumberInput, PoseIcon } from '../design-system';
import type { ArmTarget } from '../workspace/armTargets';

const DEFAULT_PAYLOAD_G = 100;
const fmt = (v: number) => (Math.round(v * 10) / 10).toString().replace('-', '−');

export const SizeArmSheet: React.FC<{
  targets: ArmTarget[];
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSize: (payloadG: number) => void;
}> = ({ targets, error, busy, onClose, onSize }) => {
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD_G);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Size Arm to Targets"
      icon={<PoseIcon className="w-4 h-4" />}
      maxWidth="max-w-[440px]"
      action={{ label: 'Size Arm', onClick: () => onSize(payload), disabled: busy, autoFocus: true }}
    >
      <div className="space-y-4">
        <ul className="space-y-1.5" data-arm-targets>
          {targets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-white/70 truncate">{t.name}</span>
              <span className="text-white/50 tabular-nums shrink-0">{t.at.map(fmt).join(', ')} mm</span>
            </li>
          ))}
        </ul>
        <FieldRow label="Payload">
          <NumberInput
            value={payload}
            min={0}
            max={5000}
            step={10}
            precision={0}
            unit="g"
            onChange={(v) => setPayload(v)}
          />
        </FieldRow>
        {error && <p className="text-[13px] text-white/70">{error}</p>}
      </div>
    </Modal>
  );
};

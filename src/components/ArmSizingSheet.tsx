import React, { useState } from 'react';
import { FieldRow, JointsIcon, Modal, NumberInput } from '../design-system';
import type { ArmTarget } from '../utils/armSizing';

const DEFAULT_PAYLOAD_G = 200;

const coordinates = (at: ArmTarget['at']) => `${at.map((v) => Math.round(v)).join(', ')} mm`;

export const ArmSizingSheet: React.FC<{
  targets: ArmTarget[];
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSize: (payloadG: number) => void;
}> = ({ targets, busy, problem, onClose, onSize }) => {
  const [payloadG, setPayloadG] = useState(DEFAULT_PAYLOAD_G);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Size Arm to Targets"
      icon={<JointsIcon className="w-4 h-4" />}
      maxWidth="max-w-[440px]"
      action={{ label: 'Size Arm', onClick: () => onSize(payloadG), disabled: busy }}
    >
      <div className="space-y-4">
        <ul className="space-y-1.5">
          {targets.map((t) => (
            <li key={t.id} data-arm-target={t.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-white/70 truncate">{t.name}</span>
              <span className="text-white/50 tabular-nums shrink-0">{coordinates(t.at)}</span>
            </li>
          ))}
        </ul>
        <FieldRow label="Payload">
          <NumberInput
            aria-label="Payload"
            value={payloadG}
            onChange={setPayloadG}
            min={0}
            max={5000}
            step={10}
            precision={0}
            unit="g"
          />
        </FieldRow>
        {problem && <p className="text-[13px] text-red-400">{problem}</p>}
      </div>
    </Modal>
  );
};

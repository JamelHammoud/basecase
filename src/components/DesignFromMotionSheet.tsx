import React, { useState } from 'react';
import { FieldRow, FileImportIcon, Modal, NumberInput } from '../design-system';
import { duration } from '../utils/duration';
import type { Mocap } from '../utils/mocap';

const DEFAULT_HEIGHT_MM = 300;

export const DesignFromMotionSheet: React.FC<{
  motion: Mocap;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onDesign: (heightMm: number) => void;
}> = ({ motion, busy, problem, onClose, onDesign }) => {
  const [heightMm, setHeightMm] = useState(DEFAULT_HEIGHT_MM);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Import ${motion.name}`}
      subtitle={duration(motion.duration)}
      icon={<FileImportIcon className="w-4 h-4" />}
      maxWidth="max-w-[440px]"
      action={{ label: 'Design From Motion', onClick: () => onDesign(heightMm), disabled: busy }}
    >
      <div className="space-y-4">
        <FieldRow label="Height">
          <NumberInput value={heightMm} onChange={setHeightMm} min={50} max={3000} step={10} precision={0} unit="mm" />
        </FieldRow>
        {problem && <p className="text-[13px] text-red-400">{problem}</p>}
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import { FieldRow, FileImportIcon, Modal, NumberInput } from '../design-system';
import { duration } from '../utils/duration';
import { MAX_HEIGHT_MM, MIN_HEIGHT_MM } from '../utils/motionSkeleton';

const DEFAULT_HEIGHT_MM = 300;

export const MotionDesignSheet: React.FC<{
  name: string;
  seconds: number;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onDesign: (heightMm: number) => void;
}> = ({ name, seconds, busy, problem, onClose, onDesign }) => {
  const [heightMm, setHeightMm] = useState(DEFAULT_HEIGHT_MM);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Import ${name}`}
      subtitle={duration(seconds)}
      icon={<FileImportIcon className="w-4 h-4" />}
      maxWidth="max-w-[440px]"
      action={{ label: 'Design From Motion', onClick: () => onDesign(heightMm), disabled: busy }}
    >
      <div className="space-y-4">
        <FieldRow label="Height">
          <NumberInput
            value={heightMm}
            onChange={setHeightMm}
            min={MIN_HEIGHT_MM}
            max={MAX_HEIGHT_MM}
            step={10}
            precision={0}
            unit="mm"
          />
        </FieldRow>
        {problem && <p className="text-[13px] text-red-400">{problem}</p>}
      </div>
    </Modal>
  );
};

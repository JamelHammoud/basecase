import { useState } from 'react';
import { FieldRow, JointsIcon, Modal, NumberInput } from '../design-system';

interface MotionDesignSheetProps {
  open: boolean;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onDesign: (heightMm: number) => void;
}

export function MotionDesignSheet({ open, busy, problem, onClose, onDesign }: MotionDesignSheetProps) {
  const [heightMm, setHeightMm] = useState(300);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Design From Motion"
      icon={<JointsIcon className="w-4 h-4" />}
      maxWidth="max-w-[440px]"
      action={{ label: 'Design Skeleton', onClick: () => onDesign(heightMm), disabled: busy }}
    >
      <div className="space-y-4">
        <FieldRow label="Height">
          <NumberInput
            value={heightMm}
            onChange={setHeightMm}
            min={1}
            step={10}
            precision={0}
            unit="mm"
            disabled={busy}
          />
        </FieldRow>
        {problem && <p className="text-[13px] text-red-400">{problem}</p>}
      </div>
    </Modal>
  );
}

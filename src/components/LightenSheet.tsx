import { useState } from 'react';
import { FieldRow, Modal, NumberInput, Section, ShapeIcon, Spinner } from '../design-system';
import type { LightenOptions } from '../workspace/lighten';

interface LightenSheetProps {
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onLighten: (options: LightenOptions) => void;
}

export function LightenSheet({ busy, problem, onClose, onLighten }: LightenSheetProps) {
  const [targetPercent, setTargetPercent] = useState(50);
  const [minWallMm, setMinWallMm] = useState(1.5);

  return (
    <Modal
      isOpen
      title="Lighten"
      icon={<ShapeIcon className="w-4 h-4" />}
      onClose={onClose}
      maxWidth="max-w-[440px]"
      action={{
        label: 'Lighten',
        disabled: busy,
        onClick: () => onLighten({ targetShare: targetPercent / 100, minWallMm }),
      }}
    >
      <div className="space-y-4" aria-busy={busy}>
        <FieldRow label="Target mass">
          <NumberInput
            value={targetPercent}
            onChange={setTargetPercent}
            min={1}
            max={99}
            precision={0}
            unit="%"
            disabled={busy}
          />
        </FieldRow>
        <Section title="Expert" collapsible defaultOpen={false} className="!px-0 !py-0 !border-b-0">
          <FieldRow label="Min. wall">
            <NumberInput
              value={minWallMm}
              onChange={setMinWallMm}
              min={1}
              unit="mm"
              precision={1}
              step={0.1}
              disabled={busy}
            />
          </FieldRow>
        </Section>
        {busy && (
          <div className="flex items-center text-white/60">
            <Spinner className="w-3.5 h-3.5" />
          </div>
        )}
        {problem && (
          <p role="alert" className="text-[13px] text-red-400">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

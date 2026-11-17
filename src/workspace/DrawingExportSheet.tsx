import { useState } from 'react';
import { FieldRow, Modal, Select } from '../design-system';
import type { DrawingOptions } from '../sheet/drawingTypes';
import type { DrawingSelection } from './drawingExport';
import type { ScenePart } from '../types/robotics';

interface DrawingExportSheetProps {
  mode: 'drawings' | 'kit';
  parts: ScenePart[];
  selectedIds: string[];
  onClose: () => void;
  onExport: (selection: DrawingSelection) => void;
}

export function DrawingExportSheet({ mode, parts, selectedIds, onClose, onExport }: DrawingExportSheetProps) {
  const [scope, setScope] = useState(selectedIds.length ? 'selection' : 'all');
  const [frame, setFrame] = useState<DrawingOptions['frame']>('part');
  const [plane, setPlane] = useState<DrawingOptions['plane']>('xy');
  const [scale, setScale] = useState(0.2);
  const ids = mode === 'drawings' && scope === 'selection' ? selectedIds : parts.map((part) => part.id);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === 'kit' ? 'Kit' : 'Drawings'}
      maxWidth="max-w-md"
      action={{
        label: 'Export',
        disabled: !ids.length,
        onClick: () => onExport({ ids, options: { frame, plane, scale } }),
      }}
    >
      <div className="flex flex-col gap-4">
        {mode === 'drawings' && (
          <FieldRow label="Parts">
            <Select
              aria-label="Parts"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              options={[
                { value: 'selection', label: 'Selection' },
                { value: 'all', label: 'Whole Design' },
              ]}
            />
          </FieldRow>
        )}
        <FieldRow label="Frame">
          <Select
            aria-label="Frame"
            value={frame}
            onChange={(event) => setFrame(event.target.value === 'scene' ? 'scene' : 'part')}
            options={[
              { value: 'part', label: 'Part' },
              { value: 'scene', label: 'Scene' },
            ]}
          />
        </FieldRow>
        <FieldRow label="Front plane">
          <Select
            aria-label="Front plane"
            value={plane}
            onChange={(event) => {
              const value = event.target.value;

              if (value === 'xy' || value === 'xz' || value === 'yz') setPlane(value);
            }}
            options={[
              { value: 'xy', label: 'XY' },
              { value: 'xz', label: 'XZ' },
              { value: 'yz', label: 'YZ' },
            ]}
          />
        </FieldRow>
        <FieldRow label="Scale">
          <Select
            aria-label="Scale"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
            options={[
              { value: '0.1', label: '1:10' },
              { value: '0.2', label: '1:5' },
              { value: '0.5', label: '1:2' },
              { value: '1', label: '1:1' },
              { value: '2', label: '2:1' },
            ]}
          />
        </FieldRow>
      </div>
    </Modal>
  );
}

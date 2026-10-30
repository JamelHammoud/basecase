import React from 'react';
import { NumberInput, Select } from '../../design-system';
import type { PrinterSetup } from '../../data/printers';
import type { SavedPrinter } from '../../print/printBridge';
import type { PrintMaterial, ProjectSettings } from '../../types/robotics';

const ADD = '__add';

const MATERIALS: Array<{ value: PrintMaterial; label: string }> = [
  { value: 'PLA', label: 'PLA' },
  { value: 'PETG', label: 'PETG' },
  { value: 'ABS', label: 'ABS' },
  { value: 'ASA', label: 'ASA' },
];

interface PrintSettingsProps {
  printer: PrinterSetup;
  printers: SavedPrinter[];
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onAddPrinter: () => void;
}

const Row: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60 shrink-0">{label}</span>
    <div className={`${wide ? 'w-[176px]' : 'w-[112px]'} min-w-0`}>{children}</div>
  </div>
);

export const qualityLabel = (name: string) => name.split(' @')[0].replace(/^(\d+\.\d+)mm/, '$1 mm');

function printerOptions(printer: PrinterSetup, printers: SavedPrinter[]) {
  const mine = printers.map((p) => ({ value: p.id, label: p.nickname }));
  const current = printer.mine ? [] : [{ value: printer.id, label: printer.label }];

  return [...current, ...mine, { value: ADD, label: 'Add Printer' }];
}

export const PrintSettings: React.FC<PrintSettingsProps> = ({
  printer,
  printers,
  project,
  onChangeProject,
  onAddPrinter,
}) => {
  const presets = printer.model.presets;
  const processes = presets?.processes ?? [];
  const process = processes.some((p) => p.name === project.printProcess) ? project.printProcess : presets?.process;

  return (
    <>
      <Row label="Printer" wide>
        <Select
          value={printer.id}
          options={printerOptions(printer, printers)}
          aria-label="Printer"
          onChange={(e) => (e.target.value === ADD ? onAddPrinter() : onChangeProject({ printer: e.target.value }))}
        />
      </Row>
      {processes.length > 0 && process && (
        <Row label="Quality" wide>
          <Select
            value={process}
            options={processes.map((p) => ({ value: p.name, label: qualityLabel(p.name) }))}
            aria-label="Quality"
            onChange={(e) => onChangeProject({ printProcess: e.target.value })}
          />
        </Row>
      )}
      <Row label="Material">
        <Select
          value={project.material}
          options={MATERIALS}
          aria-label="Material"
          onChange={(e) => onChangeProject({ material: e.target.value as PrintMaterial })}
        />
      </Row>
      <Row label="Infill">
        <NumberInput
          value={project.infillPct}
          min={5}
          max={100}
          step={5}
          precision={0}
          unit="%"
          title="Infill"
          onChange={(v, live) => !live && onChangeProject({ infillPct: v })}
        />
      </Row>
    </>
  );
};

import React from 'react';
import { NumberInput, Select } from '../../design-system';
import type { PrinterSetup } from '../../data/printers';
import type { SavedPrinter } from '../../print/printBridge';
import type { PrintMaterial, ProjectSettings } from '../../types/robotics';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';

const ADD = '__add';
const SERVICE = '__service';

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
  onChooseService: () => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-3">
    <span className="w-[64px] shrink-0 text-[13px] text-white/60">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

export const qualityLabel = (name: string) => name.split(' @')[0].replace(/^(\d+\.\d+)mm/, '$1 mm');

function printerOptions(printer: PrinterSetup, printers: SavedPrinter[]) {
  const mine = printers.map((p) => ({ value: p.id, label: p.nickname }));
  const current = printer.mine ? [] : [{ value: printer.id, label: printer.label }];

  const more = IS_WEB_DEMO
    ? []
    : [
        { value: SERVICE, label: 'Made by a Service' },
        { value: ADD, label: 'Add Printer' },
      ];

  return [...current, ...mine, ...more];
}

function choosePrinter(
  value: string,
  on: Pick<PrintSettingsProps, 'onAddPrinter' | 'onChooseService' | 'onChangeProject'>,
) {
  if (value === ADD) return on.onAddPrinter();

  if (value === SERVICE) return on.onChooseService();

  on.onChangeProject({ printer: value, madeBy: undefined });
}

export const PrintSettings: React.FC<PrintSettingsProps> = ({
  printer,
  printers,
  project,
  onChangeProject,
  onAddPrinter,
  onChooseService,
}) => {
  const presets = printer.model.presets;
  const processes = presets?.processes ?? [];
  const process = processes.some((p) => p.name === project.printProcess) ? project.printProcess : presets?.process;

  return (
    <>
      <Row label="Printer">
        <Select
          value={project.madeBy === 'service' ? SERVICE : printer.id}
          options={printerOptions(printer, printers)}
          aria-label="Printer"
          onChange={(e) => choosePrinter(e.target.value, { onAddPrinter, onChooseService, onChangeProject })}
        />
      </Row>
      {processes.length > 0 && process && (
        <Row label="Quality">
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
          aria-label="Infill"
          onChange={(v, live) => !live && onChangeProject({ infillPct: v })}
        />
      </Row>
    </>
  );
};

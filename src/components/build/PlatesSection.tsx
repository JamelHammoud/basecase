import React from 'react';
import { Button, MetaLine, Section, Switch } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { PrintToolsStatus, SavedPrinter, SlicedPlate } from '../../print/printBridge';
import { plateStatus } from '../../print/tracker';
import type { ProjectSettings } from '../../types/robotics';
import type { Printing } from '../../workspace/usePrinting';
import { hm, plural } from './format';
import { Notice } from './Notice';
import { PlateRow, plateNumbers } from './PlateRow';
import { PrintSettings, qualityLabel } from './PrintSettings';

interface PlatesSectionProps {
  printing: Printing;
  project: ProjectSettings;
  tools: PrintToolsStatus | null;
  printers: SavedPrinter[];
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onAddPrinter: () => void;
  onSelectParts: (ids: string[]) => void;
}

export function slicerName(printing: Printing, tools: PrintToolsStatus | null): string | null {
  const vendor = printing.printer.model.vendor;
  const order = vendor === 'BBL' ? ['bambu', 'orca'] : ['orca', 'bambu'];
  const found = order.map((k) => tools?.slicers.find((s) => s.kind === k)).find(Boolean);

  return found?.name ?? null;
}

function footnote(printing: Printing, project: ProjectSettings, allSliced: boolean) {
  const presets = printing.printer.model.presets;
  const quality = qualityLabel(project.printProcess ?? presets?.process ?? '0.20mm Standard');
  const slicer = printing.job.slice?.slicer;

  if (allSliced && slicer) return `Sliced in ${slicer.name} ${slicer.version ?? ''}: ${quality}, ${project.infillPct}% infill`.replace(' :', ':');

  return `Estimate for a ${printing.printer.model.name}: ${quality}, ${project.infillPct}% infill, best flat orientation. Slice to confirm.`;
}

const SliceState: React.FC<{ printing: Printing }> = ({ printing }) => {
  const { job } = printing;

  if (job.slicing)
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[12.5px] text-white/60">{job.progress ?? 'Slicing'}…</span>
        <Button size="sm" variant="ghost" onClick={job.stopSlice}>
          Stop
        </Button>
      </div>
    );

  return job.error ? <div className="text-[12.5px] text-red-400">{job.error}</div> : null;
};

function plateTotals(plates: Plate[], sliced: Array<SlicedPlate | undefined>) {
  return plates.reduce(
    (t, p, i) => {
      const n = plateNumbers(p, sliced[i]);

      return { hours: t.hours + n.hours, grams: t.grams + n.grams };
    },
    { hours: 0, grams: 0 },
  );
}

const SkipPrinted: React.FC<{ printing: Printing }> = ({ printing }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60">
      Skip {printing.printedCount} printed {plural(printing.printedCount, 'part', 'parts')}
    </span>
    <Switch checked={printing.skipPrinted} onChange={printing.setSkipPrinted} />
  </div>
);

const PlateActions: React.FC<{ printing: Printing; slicer: string | null; allSliced: boolean }> = ({
  printing,
  slicer,
  allSliced,
}) => (
  <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="primary" onClick={() => printing.openMode(1)}>
      Lay Out Plates
    </Button>
    {slicer && !printing.job.slicing && (
      <Button size="sm" variant="secondary" onClick={() => void printing.job.runSlice()}>
        {allSliced ? 'Slice Again' : 'Slice'}
      </Button>
    )}
    {slicer && (
      <Button size="sm" variant="secondary" onClick={() => void printing.job.openInSlicer()}>
        Open in {slicer}
      </Button>
    )}
  </div>
);

const PlateList: React.FC<{ printing: Printing; plates: Plate[]; sliced: Array<SlicedPlate | undefined> }> = ({
  printing,
  plates,
  sliced,
}) => (
  <ul className="-mx-[7px]">
    {plates.map((plate, i) => (
      <PlateRow
        key={plate.number}
        plate={plate}
        sliced={sliced[i]}
        status={plateStatus(plate, printing.records)}
        live={printing.status}
        onClick={() => printing.openMode(plate.number)}
      />
    ))}
  </ul>
);

export const PlatesSection: React.FC<PlatesSectionProps> = (props) => {
  const { printing, project, tools, onSelectParts } = props;
  const plates = printing.report?.plan.plates ?? [];
  const sliced = plates.map((p) => printing.freshSlice(p));
  const allSliced = plates.length > 0 && sliced.every(Boolean);
  const totals = plateTotals(plates, sliced);
  const failing = printing.report?.parts.filter((p) => p.issues.length) ?? [];
  const has = plates.length > 0;

  return (
    <Section title="Printing">
      <PrintSettings
        printer={printing.printer}
        printers={props.printers}
        project={project}
        onChangeProject={props.onChangeProject}
        onAddPrinter={props.onAddPrinter}
      />
      {has && (
        <MetaLine
          className="text-[12.5px] text-white/45 tabular-nums"
          items={[
            `${plates.length} ${plural(plates.length, 'plate', 'plates')}`,
            `${allSliced ? '' : '≈ '}${hm(totals.hours)}`,
            `${Math.round(totals.grams).toLocaleString('en-US')} g`,
          ]}
        />
      )}
      {failing.length > 0 && (
        <Notice
          tone="amber"
          text={`Fix ${failing.length} ${plural(failing.length, 'part', 'parts')} before printing`}
          onClick={() => onSelectParts(failing.map((p) => p.id))}
        />
      )}
      {printing.printedCount > 0 && <SkipPrinted printing={printing} />}
      {has && <PlateList printing={printing} plates={plates} sliced={sliced} />}
      <SliceState printing={printing} />
      {has && <PlateActions printing={printing} slicer={slicerName(printing, tools)} allSliced={allSliced} />}
      {has && <p className="text-[12px] text-white/40">{footnote(printing, project, allSliced)}</p>}
    </Section>
  );
};

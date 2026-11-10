import React from 'react';
import { Button, Divider, MetaLine, Section, SpinnerIcon, Switch } from '../../design-system';
import type { Plate, PrintPlan } from '../../print/plan';
import type { PrintToolsStatus, SavedPrinter, SlicedPlate } from '../../print/printBridge';
import { plateStatus } from '../../print/tracker';
import type { ProjectSettings } from '../../types/robotics';
import type { Printing } from '../../workspace/usePrinting';
import { hm, plural } from './format';
import { PlateRow, plateNumbers } from './PlateRow';
import { PrintedSection } from './PrintedSection';
import { PrintSettings } from './PrintSettings';

interface PlatesSectionProps {
  printing: Printing;
  project: ProjectSettings;
  tools: PrintToolsStatus | null;
  printers: SavedPrinter[];
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onAddPrinter: () => void;
  onSelectParts: (ids: string[]) => void;
}

interface PlateTotals {
  hours: number;
  grams: number;
  exact: boolean;
}

export function slicerName(printing: Printing, tools: PrintToolsStatus | null): string | null {
  const vendor = printing.printer.model.vendor;
  const order = vendor === 'BBL' ? ['bambu', 'orca'] : ['orca', 'bambu'];
  const found = order.map((k) => tools?.slicers.find((s) => s.kind === k)).find(Boolean);

  return found?.name ?? null;
}

function plateTotals(plates: Plate[], sliced: Array<SlicedPlate | undefined>): PlateTotals {
  return plates.reduce<PlateTotals>(
    (t, p, i) => {
      const n = plateNumbers(p, sliced[i]);

      return { hours: t.hours + n.hours, grams: t.grams + n.grams, exact: t.exact && n.exact };
    },
    { hours: 0, grams: 0, exact: true },
  );
}

function collapsedSummary(printing: Printing, plates: Plate[], totals: PlateTotals) {
  if (printing.job.slicing) return 'Slicing…';

  if (!plates.length) return undefined;

  return `${totals.exact ? '' : '≈ '}${hm(totals.hours)}`;
}

const SkipPrinted: React.FC<{ printing: Printing }> = ({ printing }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60">
      Skip {printing.printedCount} printed {plural(printing.printedCount, 'part', 'parts')}
    </span>
    <Switch aria-label="Skip printed parts" checked={printing.skipPrinted} onChange={printing.setSkipPrinted} />
  </div>
);

const Totals: React.FC<{ plateCount: number; totals: PlateTotals }> = ({ plateCount, totals }) => (
  <div>
    <div className="text-[20px] font-semibold tabular-nums text-white/90 leading-tight">
      {!totals.exact && <span className="text-white/50 font-normal mr-1">≈</span>}
      {hm(totals.hours)}
    </div>
    <MetaLine
      className="mt-1 text-[12.5px] text-white/50 tabular-nums"
      items={[
        `${plateCount} ${plural(plateCount, 'plate', 'plates')}`,
        `${Math.round(totals.grams).toLocaleString('en-US')} g`,
      ]}
    />
  </div>
);

const SliceProgress: React.FC<{ printing: Printing }> = ({ printing }) => (
  <div className="basis-full min-w-0 flex items-center gap-2">
    <SpinnerIcon className="w-4 h-4 shrink-0 text-white/35 animate-spin" />
    <span className="flex-1 min-w-0 truncate text-[13px] text-white/60">{printing.job.progress ?? 'Slicing'}…</span>
    <Button size="sm" variant="ghost" onClick={printing.job.stopSlice}>
      Stop
    </Button>
  </div>
);

const SlicerActions: React.FC<{ printing: Printing; slicer: string; allSliced: boolean }> = ({
  printing,
  slicer,
  allSliced,
}) => (
  <>
    <Button size="sm" variant="secondary" className="grow" onClick={() => void printing.job.runSlice()}>
      {allSliced ? 'Slice Again' : 'Slice'}
    </Button>
    <Button size="sm" variant="secondary" className="grow" onClick={() => void printing.job.openInSlicer()}>
      Open in {slicer}
    </Button>
  </>
);

const PlateActions: React.FC<{ printing: Printing; slicer: string | null; allSliced: boolean }> = ({
  printing,
  slicer,
  allSliced,
}) => (
  <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="primary" fullWidth onClick={() => printing.openMode(1)}>
      Lay Out Plates
    </Button>
    {printing.job.slicing && <SliceProgress printing={printing} />}
    {slicer && !printing.job.slicing && <SlicerActions printing={printing} slicer={slicer} allSliced={allSliced} />}
  </div>
);

const PlateList: React.FC<{ printing: Printing; plan: PrintPlan; sliced: Array<SlicedPlate | undefined> }> = ({
  printing,
  plan,
  sliced,
}) => (
  <ul className="-mx-[7px] -my-1">
    {plan.plates.map((plate, i) => (
      <PlateRow
        key={plate.number}
        plate={plate}
        bed={plan.bed}
        sliced={sliced[i]}
        status={plateStatus(plate, printing.records)}
        live={printing.status}
        onClick={() => printing.openMode(plate.number)}
      />
    ))}
  </ul>
);

const PlatesResult: React.FC<PlatesSectionProps & { plan: PrintPlan }> = ({ printing, plan, tools }) => {
  const sliced = plan.plates.map((p) => printing.freshSlice(p));
  const allSliced = sliced.every(Boolean);

  return (
    <>
      <PlateActions printing={printing} slicer={slicerName(printing, tools)} allSliced={allSliced} />
      {printing.job.error && <div className="text-[12.5px] text-red-400">{printing.job.error}</div>}
      <Divider className="my-4" />
      <PlateList printing={printing} plan={plan} sliced={sliced} />
    </>
  );
};

export const PlatesSection: React.FC<PlatesSectionProps> = (props) => {
  const { printing, project, onSelectParts } = props;
  const plan = printing.report?.plan;
  const plates = plan?.plates ?? [];
  const totals = plateTotals(
    plates,
    plates.map((p) => printing.freshSlice(p)),
  );

  return (
    <Section title="Printing" summary={collapsedSummary(printing, plates, totals)} collapsible defaultOpen={false}>
      <PrintSettings
        printer={printing.printer}
        printers={props.printers}
        project={project}
        onChangeProject={props.onChangeProject}
        onAddPrinter={props.onAddPrinter}
      />
      {printing.printedCount > 0 && <SkipPrinted printing={printing} />}
      {plates.length > 0 && <Divider className="my-4" />}
      {plates.length > 0 && <Totals plateCount={plates.length} totals={totals} />}
      {plan && plates.length > 0 && <PlatesResult {...props} plan={plan} />}
      <PrintedSection report={printing.report} project={project} onSelectParts={onSelectParts} />
    </Section>
  );
};

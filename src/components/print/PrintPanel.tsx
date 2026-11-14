import React, { useState } from 'react';
import { Button, MetaLine, ModeHeader, NumberInput, Section, Switch, useScrollFade } from '../../design-system';
import { slicerOrder } from '../../data/printers';
import type { Plate } from '../../print/plan';
import type { PrintToolsStatus, SavedPrinter } from '../../print/printBridge';
import { plateStatus } from '../../print/tracker';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import type { Printing } from '../../workspace/usePrinting';
import { plural } from '../../../electron/plural.mjs';
import { duration } from '../../utils/duration';
import { plateNumbers, plateStateText } from './plateFacts';
import { MergeSection } from './MergeSection';
import { PrintedSection } from './PrintedSection';
import { PrinterLive } from './PrinterLive';
import { PrintSettings } from './PrintSettings';
import { StartPrintSheet } from './StartPrintSheet';

interface PrintPanelProps {
  printing: Printing;
  parts: ScenePart[];
  project: ProjectSettings;
  printers: SavedPrinter[];
  tools: PrintToolsStatus | null;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onAddPrinter: () => void;
  onDone: () => void;
}

function slicerName(printing: Printing, tools: PrintToolsStatus | null): string | null {
  const found = slicerOrder(printing.printer.model)
    .map((k) => tools?.slicers.find((s) => s.kind === k))
    .find(Boolean);

  return found?.name ?? null;
}

function showPart(printing: Printing, id: string) {
  const plate = printing.report?.parts.find((p) => p.id === id)?.plate;

  if (plate) printing.setModePlate(plate);

  printing.selectPart(id);
}

const SkipPrinted: React.FC<{ printing: Printing }> = ({ printing }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60">Skip {plural(printing.printedCount, 'printed part')}</span>
    <Switch aria-label="Skip printed parts" checked={printing.skipPrinted} onChange={printing.setSkipPrinted} />
  </div>
);

const throughStudio = (printing: Printing) =>
  !printing.printer.mine?.connection || printing.printer.mine.connection.kind === 'bambu-studio';

function sendLabel(printing: Printing, plate: Plate) {
  if (throughStudio(printing)) return `Send Plate ${plate.number}`;

  return printing.printer.mine?.connection?.kind === 'bambu-connect'
    ? 'Open in Bambu Connect'
    : `Print Plate ${plate.number}`;
}

interface PlateHandlers {
  onSend: () => void;
  onAddPrinter: () => void;
}

const SendButton: React.FC<PlateHandlers & { printing: Printing; plate: Plate; blocked: boolean }> = ({
  printing,
  plate,
  blocked,
  onSend,
  onAddPrinter,
}) => {
  if (printing.printer.mine)
    return (
      <Button size="sm" variant="primary" disabled={blocked} onClick={onSend}>
        {printing.sending === plate.number ? 'Sending…' : sendLabel(printing, plate)}
      </Button>
    );

  if (IS_WEB_DEMO) return null;

  return (
    <Button size="sm" variant="primary" onClick={onAddPrinter}>
      Add Printer
    </Button>
  );
};

const SliceNotes: React.FC<{ printing: Printing; warnings: string[] }> = ({ printing, warnings }) => (
  <>
    {warnings.map((w) => (
      <div key={w} className="text-[12.5px] text-amber-400">
        {w}
      </div>
    ))}
    {printing.job.error && <div className="text-[12.5px] text-red-400">{printing.job.error}</div>}
    {printing.job.slicing && (
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] text-white/60">{printing.job.progress ?? 'Slicing'}…</span>
        <Button size="sm" variant="ghost" onClick={printing.job.stopSlice}>
          Stop
        </Button>
      </div>
    )}
  </>
);

const PlateMarks: React.FC<{ printing: Printing; plate: Plate }> = ({ printing, plate }) => {
  const state = plateStatus(plate, printing.records).state;
  const active = state === 'printing' || state === 'sent';

  return (
    <div className="flex flex-wrap gap-2">
      {state !== 'printed' && (
        <Button size="sm" variant="ghost" onClick={() => printing.markPlate(plate, 'printed')}>
          Mark Printed
        </Button>
      )}
      {active && (
        <Button size="sm" variant="ghost" onClick={() => printing.markPlate(plate, 'failed')}>
          Mark Failed
        </Button>
      )}
    </div>
  );
};

const PlateActions: React.FC<PlateHandlers & { printing: Printing; plate: Plate; slicer: string | null }> = ({
  printing,
  plate,
  slicer,
  onSend,
  onAddPrinter,
}) => {
  const blocked = printing.sending !== null || printing.job.slicing || !slicer;

  return (
    <div className="flex flex-wrap gap-2 empty:hidden">
      <SendButton printing={printing} plate={plate} blocked={blocked} onSend={onSend} onAddPrinter={onAddPrinter} />
      {slicer && (
        <Button size="sm" variant="secondary" onClick={() => void printing.job.openInSlicer(plate.material)}>
          Open in {slicer}
        </Button>
      )}
    </div>
  );
};

const PlateDetail: React.FC<PlateHandlers & { printing: Printing; plate: Plate; tools: PrintToolsStatus | null }> = ({
  printing,
  plate,
  tools,
  onSend,
  onAddPrinter,
}) => {
  const sliced = printing.freshSlice(plate);
  const { hours, grams, exact } = plateNumbers(plate, sliced);
  const status = plateStatus(plate, printing.records);

  return (
    <Section title={`Plate ${plate.number}`}>
      {sliced?.thumbnail && (
        <img src={sliced.thumbnail} alt="" className="preview w-full aspect-square object-contain" />
      )}
      <MetaLine
        className="text-[12.5px] text-white/50 tabular-nums"
        items={[
          plate.material,
          `${exact ? '' : '≈ '}${duration(hours * 3600, 'min')}`,
          `${Math.round(grams)} g`,
          sliced?.support && 'Supports',
          plateStateText(status, printing.status),
        ]}
      />
      <SliceNotes printing={printing} warnings={sliced?.warnings ?? []} />
      <PlateActions
        printing={printing}
        plate={plate}
        slicer={slicerName(printing, tools)}
        onSend={onSend}
        onAddPrinter={onAddPrinter}
      />
      {!printing.fitTest && <PlateMarks printing={printing} plate={plate} />}
    </Section>
  );
};

const PartControls: React.FC<{ printing: Printing; part: ScenePart; plates: Plate[] }> = ({
  printing,
  part,
  plates,
}) => {
  const plate = plates.find((p) => p.items.some((it) => it.id === part.id));
  const sameMaterial = plates.filter((p) => p.material === plate?.material);
  const set = (patch: Parameters<Printing['setPartPrint']>[1]) => printing.setPartPrint([part.id], patch);

  return (
    <Section title={part.name}>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={printing.mode?.face ? 'primary' : 'secondary'}
          title="Lay on face"
          shortcut="F"
          onClick={() => printing.setFaceMode(!printing.mode?.face)}
        >
          Lay on Face
        </Button>
        <Button size="sm" variant="secondary" title="Turn 90°" shortcut="R" onClick={() => printing.turnPart(part.id)}>
          Turn 90°
        </Button>
        {part.print?.down && (
          <Button size="sm" variant="ghost" onClick={() => set({ down: undefined, at: undefined, turned: undefined })}>
            Best Face
          </Button>
        )}
      </div>
      {sameMaterial.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sameMaterial.map((p) => (
            <Button
              key={p.number}
              size="xs"
              variant={p.number === plate?.number ? 'primary' : 'ghost'}
              onClick={() => set({ plate: p.local, at: undefined })}
            >
              Plate {p.number}
            </Button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-white/60">Copies</span>
        <div className="w-[112px]">
          <NumberInput
            value={part.print?.copies ?? 1}
            min={1}
            max={20}
            step={1}
            precision={0}
            aria-label="Copies"
            onChange={(v, live) => !live && set({ copies: v > 1 ? v : undefined })}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-white/60">Don’t print</span>
        <Switch
          aria-label="Don’t print"
          checked={!!part.print?.skip}
          onChange={(skip) => set({ skip: skip || undefined })}
        />
      </div>
    </Section>
  );
};

function usePlateSend(printing: Printing) {
  const [confirming, setConfirming] = useState<Plate | null>(null);

  const send = (plate: Plate) => {
    if (throughStudio(printing) || printing.printer.mine?.connection?.kind === 'bambu-connect')
      void printing.sendPlate(plate);
    else setConfirming(plate);
  };

  return { confirming, setConfirming, send };
}

export const PrintPanel: React.FC<PrintPanelProps> = (props) => {
  const { printing, parts, onDone } = props;
  const { ref, style } = useScrollFade();
  const plates = printing.report?.plan.plates ?? [];
  const plate = plates.find((p) => p.number === printing.mode?.plate) ?? plates[0];
  const selected = parts.find((p) => p.id === printing.mode?.selected);
  const sending = usePlateSend(printing);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ModeHeader
        title={printing.fitTest ? 'Print Fit Test' : 'Print'}
        onDone={onDone}
        actions={
          !printing.fitTest &&
          printing.canFitTest && (
            <Button
              variant="secondary"
              size="sm"
              disabled={printing.fitCutting}
              onClick={() => void printing.startFitTest()}
            >
              Print Fit Test
            </Button>
          )
        }
      />
      <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <Section title="Printer">
          <PrintSettings
            printer={printing.printer}
            printers={props.printers}
            project={props.project}
            onChangeProject={props.onChangeProject}
            onAddPrinter={props.onAddPrinter}
          />
          {printing.printedCount > 0 && !printing.fitTest && <SkipPrinted printing={printing} />}
          <PrinterLive printing={printing} />
        </Section>
        {selected && <PartControls printing={printing} part={selected} plates={plates} />}
        {plate && (
          <PlateDetail
            printing={printing}
            plate={plate}
            tools={props.tools}
            onSend={() => sending.send(plate)}
            onAddPrinter={props.onAddPrinter}
          />
        )}
        <MergeSection merges={printing.merges} parts={parts} />
        <PrintedSection
          report={printing.report}
          project={props.project}
          onSelectParts={([id]) => id && showPart(printing, id)}
        />
      </div>
      <StartPrintSheet
        plate={sending.confirming}
        sliced={sending.confirming ? printing.freshSlice(sending.confirming) : undefined}
        printer={printing.printer}
        live={printing.status}
        onClose={() => sending.setConfirming(null)}
        onStart={() => {
          const target = sending.confirming;

          sending.setConfirming(null);

          if (target) void printing.sendPlate(target);
        }}
      />
    </div>
  );
};

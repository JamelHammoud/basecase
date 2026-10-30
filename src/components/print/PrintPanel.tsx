import React, { useState } from 'react';
import { Button, MetaLine, NumberInput, Section, Switch, useScrollFade } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { PrintToolsStatus, SavedPrinter } from '../../print/printBridge';
import { plateStatus } from '../../print/tracker';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import type { Printing } from '../../workspace/usePrinting';
import { hm } from '../build/format';
import { PlateRow, plateNumbers } from '../build/PlateRow';
import { slicerName } from '../build/PlatesSection';
import { PrintSettings } from '../build/PrintSettings';
import { PrinterLive } from './PrinterLive';
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

const throughStudio = (printing: Printing) =>
  !printing.printer.mine?.connection || printing.printer.mine.connection.kind === 'bambu-studio';

function sendLabel(printing: Printing, plate: Plate) {
  if (!printing.printer.mine) return 'Add Printer to Send';

  if (throughStudio(printing)) return `Send Plate ${plate.number}`;

  return printing.printer.mine.connection?.kind === 'bambu-connect'
    ? 'Open in Bambu Connect'
    : `Print Plate ${plate.number}`;
}

const SliceNotes: React.FC<{ printing: Printing; warnings: string[] }> = ({ printing, warnings }) => (
  <>
    {warnings.map((w) => (
      <div key={w} className="text-[12.5px] text-amber-400">
        {w}
      </div>
    ))}
    {printing.job.error && <div className="text-[12.5px] text-red-400">{printing.job.error}</div>}
    {printing.job.slicing && <div className="text-[12.5px] text-white/60">{printing.job.progress ?? 'Slicing'}…</div>}
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

const PlateActions: React.FC<{ printing: Printing; plate: Plate; slicer: string | null; onSend: () => void }> = ({
  printing,
  plate,
  slicer,
  onSend,
}) => {
  const blocked = printing.sending !== null || printing.job.slicing || (!slicer && !!printing.printer.mine);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="primary" disabled={blocked} onClick={onSend}>
        {printing.sending === plate.number ? 'Sending…' : sendLabel(printing, plate)}
      </Button>
      {slicer && (
        <Button size="sm" variant="secondary" onClick={() => void printing.job.openInSlicer(plate.material)}>
          Open in {slicer}
        </Button>
      )}
    </div>
  );
};

const PlateDetail: React.FC<{
  printing: Printing;
  plate: Plate;
  tools: PrintToolsStatus | null;
  onSend: () => void;
}> = ({ printing, plate, tools, onSend }) => {
  const sliced = printing.freshSlice(plate);
  const { hours, grams, exact } = plateNumbers(plate, sliced);

  return (
    <Section title={`Plate ${plate.number}`}>
      {sliced?.thumbnail && (
        <img src={sliced.thumbnail} alt="" className="preview w-full aspect-square object-contain" />
      )}
      <MetaLine
        className="text-[12.5px] text-white/45 tabular-nums"
        items={[
          plate.material,
          `${exact ? '' : '≈ '}${hm(hours)}`,
          `${Math.round(grams)} g`,
          sliced?.support && 'Supports',
        ]}
      />
      <SliceNotes printing={printing} warnings={sliced?.warnings ?? []} />
      <PlateActions printing={printing} plate={plate} slicer={slicerName(printing, tools)} onSend={onSend} />
      <PlateMarks printing={printing} plate={plate} />
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
        <Button
          size="sm"
          variant="secondary"
          title="Turn 90°"
          shortcut="R"
          onClick={() => plate && set({ turned: !part.print?.turned, at: undefined, plate: plate.local })}
        >
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
            title="Copies"
            onChange={(v, live) => !live && set({ copies: v > 1 ? v : undefined })}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-white/60">Don't print</span>
        <Switch checked={!!part.print?.skip} onChange={(skip) => set({ skip: skip || undefined })} />
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
      <div className="h-[44px] shrink-0 pl-[12px] pr-[8px] flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white/90">Print</h2>
        <Button variant="primary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
      <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <Section title="Printer">
          <PrintSettings
            printer={printing.printer}
            printers={props.printers}
            project={props.project}
            onChangeProject={props.onChangeProject}
            onAddPrinter={props.onAddPrinter}
          />
          <PrinterLive printing={printing} />
        </Section>
        {selected && <PartControls printing={printing} part={selected} plates={plates} />}
        {plate && (
          <PlateDetail printing={printing} plate={plate} tools={props.tools} onSend={() => sending.send(plate)} />
        )}
        <Section title="Plates">
          <ul className="-mx-[7px]">
            {plates.map((p) => (
              <PlateRow
                key={p.number}
                plate={p}
                sliced={printing.freshSlice(p)}
                status={plateStatus(p, printing.records)}
                live={printing.status}
                selected={p.number === plate?.number}
                onClick={() => printing.setModePlate(p.number)}
              />
            ))}
          </ul>
        </Section>
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

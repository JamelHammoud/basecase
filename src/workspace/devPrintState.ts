import { guideStepParts } from '../guide/guideSteps';
import { jobSpec } from '../print/job';
import { plateStatus } from '../print/tracker';
import type { WorkspaceCore } from './useWorkspaceCore';

export function printDevActions(core: WorkspaceCore) {
  const { printing, docs } = core;

  return {
    printState: () => ({
      open: !!printing.mode,
      printer: printing.printer.model.id,
      bed: printing.report?.plan.bed ?? null,
    }),
    printPlates: () => ({
      open: !!printing.mode,
      fitTest: !!printing.fitTest,
      plates: (printing.report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
    }),
    plateFiles: async (): Promise<Record<string, Uint8Array>> =>
      printing.report
        ? (await printing.plates.write(jobSpec(printing.report.plan, printing.printer, docs.projectRef.current))).files
        : {},
    labelNotes: () => printing.plates.notes,
    markPlatePrinted: (number: number) => {
      const plate = printing.report?.plan.plates.find((p) => p.number === number);

      if (plate && plateStatus(plate, printing.records).state !== 'printed') printing.markPlate(plate, 'printed');
    },
    readySteps: () => printing.readySteps(guideStepParts(docs.partsRef.current, docs.projectRef.current)),
  };
}

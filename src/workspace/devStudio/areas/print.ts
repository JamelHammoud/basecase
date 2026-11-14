import { guideStepParts } from '../../../guide/guideSteps';
import { jobSpec } from '../../../print/job';
import { plateStatus } from '../../../print/tracker';
import { base64Files } from '../base64Files';
import type { Studio, StudioContext } from '../types';

async function plateFiles({ core }: StudioContext) {
  const { printing, docs } = core;

  if (!printing.report) return {};

  const job = jobSpec(printing.report.plan, printing.printer, docs.projectRef.current);

  return base64Files((await printing.plates.write(job)).files);
}

export default function printStudio(studio: Studio) {
  const printing = () => studio().core.printing;

  return {
    printState: () => {
      const { mode, printer, report } = printing();

      return {
        open: !!mode,
        printer: printer.model.id,
        madeBy: studio().core.project.madeBy ?? null,
        bed: report?.plan.bed ?? null,
      };
    },
    printPlates: () => {
      const { mode, fitTest, report } = printing();

      return {
        open: !!mode,
        fitTest: !!fitTest,
        plates: (report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
      };
    },
    plateFiles: () => plateFiles(studio()),
    labelNotes: () => printing().plates.notes,
    markPlatePrinted: (number: number) => {
      const current = printing();
      const plate = current.report?.plan.plates.find((p) => p.number === number);

      if (plate && plateStatus(plate, current.records).state !== 'printed') current.markPlate(plate, 'printed');
    },
    readySteps: () => {
      const { docs } = studio().core;

      return printing().readySteps(guideStepParts(docs.partsRef.current, docs.projectRef.current));
    },
  };
}

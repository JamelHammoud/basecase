import type { ScenePart } from '../types/robotics';
import { generateGuideSteps } from '../guide/generateGuide';
import { firstSteps } from '../guide/guideSteps';
import { printReportIn } from '../three/analysis/analysisPool';
import {
  buildPreparedPrintReport,
  loadPrintShapes,
  preparePrintReport,
  type PrintContext,
  type PrintShapes,
  type PreparedPrintReport,
  type PrintReport,
} from './printReport';

interface PreparedReport {
  input: PreparedPrintReport;
  pending: Promise<PrintReport>;
}

let latest: PreparedReport | null = null;

const sameFields = (left: object, right: object) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && value === Reflect.get(right, key));

function sameInput(left: PreparedPrintReport, right: PreparedPrintReport): boolean {
  return (
    sameFields(left.ctx.project, right.ctx.project) &&
    sameFields(left.ctx.printer, right.ctx.printer) &&
    left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const next = right.entries[index];

      return entry.key === next.key && entry.shape === next.shape && sameFields(entry.part, next.part);
    }) &&
    left.firstStep.size === right.firstStep.size &&
    [...left.firstStep].every(([id, step]) => right.firstStep.get(id) === step)
  );
}

async function rendererReport(input: PreparedPrintReport): Promise<PrintReport> {
  let entry = latest;

  if (!entry || !sameInput(entry.input, input)) {
    const next = { input, pending: printReportIn(input) };

    next.pending.catch(() => {
      if (latest === next) latest = null;
    });
    latest = next;
    entry = next;
  }

  return structuredClone(await entry.pending);
}

export async function printReportOf(parts: ScenePart[], ctx: PrintContext, fetchShapes: PrintShapes) {
  const [, steps] = await Promise.all([
    loadPrintShapes(
      parts.filter((part) => part.id !== ctx.project.electronicsBoard?.partId),
      fetchShapes,
    ),
    generateGuideSteps(ctx.scene ?? parts, ctx.project),
  ]);

  const input = preparePrintReport(parts, ctx, firstSteps(steps));

  return typeof window === 'undefined' ? buildPreparedPrintReport(input) : rendererReport(input);
}

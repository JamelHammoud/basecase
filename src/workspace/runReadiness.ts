import { assemblyReport, serviceableIds } from '../assembly/assemblyReport';
import { rememberClamps } from '../assembly/clampCache';
import { clampsOf } from '../assembly/followers';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import { loadSourced } from '../data/loadSourced';
import type { PrinterSetup } from '../data/printers';
import { registerSourced } from '../data/sourcedItems';
import {
  fitProbeFindings,
  fixedMateFindings,
  goneMateFindings,
  goneMateIds,
  hiddenFindings,
  sourcingFindings,
  threadFindings,
  unprintableFindings,
} from '../readiness/buildChecks';
import { assemblyFindings, bomFindings, engineeringFindings, fitFindings, printFindings } from '../readiness/findings';
import { readinessFingerprint, readinessOf, UNSETTLED_FINGERPRINT } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { designedFits } from '../utils/designedFits';
import { jsonHash } from '../utils/geometryHash';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf } from '../utils/printReport';
import { runEngineeringNow } from './engineeringNow';

const BUDGET_MS = 30000;

export interface ReadinessInput {
  viewport: Viewport3DHandle;
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  fingerprint: string;
}

export interface ReadinessWorld {
  purchases: object | null;
  money: { code: string; ratesDate: string };
}

export const batteriesIn = (parts: ScenePart[]) =>
  parts
    .filter((p) => {
      const battery = p.componentId ? COMPONENT_BY_ID[p.componentId]?.battery : undefined;

      return !!battery && !battery.cell;
    })
    .map((p) => p.id);

export const projectFingerprint = (
  parts: ScenePart[],
  project: ProjectSettings,
  printerId: string,
  world: ReadinessWorld,
) =>
  readinessFingerprint(parts, {
    joints: project.joints,
    budget: project.budgetUsd,
    tether: project.tether,
    extras: project.extras,
    sourced: jsonHash(project.sourced),
    material: project.material,
    infill: project.infillPct,
    printProcess: project.printProcess,
    animations: jsonHash(project.animations),
    firstRanges: project.firstRanges,
    goneMates: goneMateIds(project.joints),
    printerId,
    purchases: jsonHash(world.purchases ?? {}),
    money: [world.money.code, world.money.ratesDate],
  });

function supportOf(print: { parts: Array<{ material: PrintMaterial; supportG: number }> }) {
  const supportG: Partial<Record<PrintMaterial, number>> = {};

  for (const r of print.parts) supportG[r.material] = (supportG[r.material] ?? 0) + r.supportG;

  return supportG;
}

export async function runReadiness({
  viewport,
  parts,
  project,
  printer,
  fingerprint,
}: ReadinessInput): Promise<Readiness> {
  await loadSourced();
  registerSourced(project.sourced ?? []);
  await viewport.meshesReady();

  const printing = printReportOf(parts, { project, printer }, viewport.printShapes);
  const engineeringRun = printing.then((report) =>
    runEngineeringNow({
      viewport,
      parts,
      project,
      withSweep: true,
      supportG: supportOf(report),
      printDowns: Object.fromEntries(report.parts.map((r) => [r.id, r.check.pose.down])),
    }),
  );
  const [engineering, geometry, print, purchases, measures] = await Promise.all([
    engineeringRun,
    viewport.assembly({ serviceable: serviceableIds(parts), budgetMs: BUDGET_MS, batteries: batteriesIn(parts) }),
    printing,
    platformBridge.listPurchases(),
    viewport.measureParts(),
  ]);

  rememberClamps(parts, clampsOf(geometry.chains));

  const fits = designedFits(await viewport.interference(), parts, geometry.chains);
  const bom = buildBom({ parts, project, purchases, measures, supportG: supportOf(print) });

  return readinessOf(
    [
      ...assemblyFindings(assemblyReport(parts, geometry)),
      ...engineeringFindings(engineering),
      ...fitFindings(fits.items),
      ...printFindings(print),
      ...bomFindings(bom),
      ...sourcingFindings(bom),
      ...unprintableFindings(parts),
      ...fitProbeFindings(geometry, parts),
      ...threadFindings(geometry, parts),
      ...hiddenFindings(parts),
      ...fixedMateFindings(parts),
      ...goneMateFindings(project.joints),
    ],
    {
      parts,
      decisions: project.readiness,
      fingerprint: geometry.timedOut ? UNSETTLED_FINGERPRINT : fingerprint,
      rows: engineering.rows,
    },
  );
}

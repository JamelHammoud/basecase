import { assemblyReport, serviceableIds } from '../assembly/assemblyReport';
import { rememberClamps } from '../assembly/clampCache';
import { clampsOf } from '../assembly/followers';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import { loadSourced } from '../data/loadSourced';
import type { PrinterSetup } from '../data/printers';
import { registerSourced } from '../data/sourcedItems';
import { fitProbeFindings, sourcingFindings, threadFindings, unprintableFindings } from '../readiness/buildChecks';
import { assemblyFindings, bomFindings, engineeringFindings, fitFindings, printFindings } from '../readiness/findings';
import { readinessFingerprint, readinessOf } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { designedFits } from '../utils/designedFits';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf } from '../utils/printReport';
import { runEngineeringNow } from './engineeringNow';

const BUDGET_MS = 30000;

export interface ReadinessInput {
  viewport: Viewport3DHandle;
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
}

const batteriesIn = (parts: ScenePart[]) =>
  parts.filter((p) => p.componentId && COMPONENT_BY_ID[p.componentId]?.battery).map((p) => p.id);

export const projectFingerprint = (parts: ScenePart[], project: ProjectSettings, printerId: string) =>
  readinessFingerprint(parts, {
    joints: project.joints,
    budget: project.budgetUsd,
    extras: project.extras,
    sourced: project.sourced?.map((s) => [s.id, s.link.status, !!s.mesh]),
    material: project.material,
    printerId,
  });

export async function runReadiness({ viewport, parts, project, printer }: ReadinessInput): Promise<Readiness> {
  await loadSourced();
  registerSourced(project.sourced ?? []);

  const fingerprint = projectFingerprint(parts, project, printer.model.id);
  const [engineering, geometry, print, purchases, measures] = await Promise.all([
    runEngineeringNow({ viewport, parts, project, withSweep: true }),
    viewport.assembly({ serviceable: serviceableIds(parts), budgetMs: BUDGET_MS, batteries: batteriesIn(parts) }),
    printReportOf(parts, { project, printer }, viewport.printShapes),
    platformBridge.listPurchases(),
    viewport.measureParts(),
  ]);

  rememberClamps(parts, clampsOf(geometry.chains));

  const fits = designedFits(await viewport.interference(), parts, geometry.chains);
  const supportG: Partial<Record<PrintMaterial, number>> = {};

  for (const r of print.parts) supportG[r.material] = (supportG[r.material] ?? 0) + r.supportG;

  const bom = buildBom({ parts, project, purchases, measures, supportG });

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
    ],
    { parts, decisions: project.readiness, fingerprint, rows: engineering.rows },
  );
}

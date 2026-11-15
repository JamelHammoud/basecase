import { assemblyReport } from '../assembly/assemblyReport';
import { jointsWithChains } from '../assembly/rigJoints';
import { resolvePrinter } from '../data/printers';
import { registerSourced } from '../data/sourcedItems';
import {
  fitProbeFindings,
  fixedMateFindings,
  goneMateFindings,
  hiddenFindings,
  sourcingFindings,
  threadFindings,
  unprintableFindings,
} from '../readiness/buildChecks';
import { assemblyFindings, bomFindings, engineeringFindings, fitFindings, printFindings } from '../readiness/findings';
import { ownedBy, readinessOf } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import { printReportOf } from '../three/analysis/shapeReports';
import type { SweepSpec } from '../three/analysis/sweep';
import type { CheckRow } from '../utils/engineeringTypes';
import { strengthOf } from '../three/analysis/strengthPart';
import { buildBom, isPrinted } from '../utils/bom';
import { designedFits } from '../utils/designedFits';
import { runEngineering } from '../utils/engineering';
import { SERVO_TOUCH_MM, servoTouchPairs } from '../utils/engineeringHeat';
import { payloadMap } from '../utils/payload';
import { reportFromShapes } from '../utils/printReport';
import { StudyGradeCache } from './gradeCache';
import { gradeStudyReport } from './study';
import type { StudyGradeOptions, StudyRow, StudyScene } from './types';

export function createStudyGrader() {
  const cache = new StudyGradeCache();

  return {
    grade: (scene: StudyScene, options: StudyGradeOptions) => {
      if (typeof document !== 'undefined') throw new Error('Study Checks need a worker.');

      registerSourced(scene.project.sourced ?? []);

      return gradeWithCache(scene, options, cache);
    },
    dispose: () => cache.dispose(),
  };
}

export function gradeStudyDetached(scene: StudyScene, options: StudyGradeOptions): StudyRow {
  const grader = createStudyGrader();

  try {
    return grader.grade(scene, options);
  } finally {
    grader.dispose();
  }
}

function studyChecks(readiness: Readiness): CheckRow[] {
  return readiness.checks.map(({ name, ...check }) => {
    const findings = readiness.findings.filter(ownedBy({ name, caseId: check.caseId }));
    const items = findings.map((finding) => ({
      text: finding.detail ?? finding.text,
      ids: finding.ids,
      status: finding.level === 'blocker' ? ('fail' as const) : ('warn' as const),
      fix: finding.fix,
      joint: finding.joint,
    }));

    return {
      ...check,
      check: name,
      detail: check.detail || items.map((item) => item.text).join('\n'),
      agentText: findings.map((finding) => finding.agentText).join('\n'),
      items,
    };
  });
}

function gradeWithCache(scene: StudyScene, options: StudyGradeOptions, cache: StudyGradeCache): StudyRow {
  const parts = scene.parts.filter((part) => part.visible && part.role === 'solid' && part.kind !== 'image_plane');
  const placement = cache.placement(scene, parts);
  const { placed, measures } = placement;
  const geometry = cache.assembly(placement, parts);
  const printer = scene.printer ?? resolvePrinter(scene.project.printer, []);
  const entries = parts
    .filter((p) => isPrinted(p) && !p.print?.skip)
    .flatMap((part) => {
      const shape = printReportOf(cache.solid(scene.triangles[part.id]), part.print?.down ? [part.print.down] : []);

      return shape.check ? [{ part, shape: { ...shape, check: shape.check } }] : [];
    });
  const print = reportFromShapes(entries, { project: scene.project, printer, scene: scene.parts });
  const project = { ...scene.project, joints: jointsWithChains(scene.project.joints ?? [], parts, geometry.chains) };
  const supportG = Object.fromEntries(
    print.parts.map((p) => [
      p.material,
      print.parts.filter((q) => q.material === p.material).reduce((n, q) => n + q.supportG, 0),
    ]),
  );
  const byId = new Map(placed.map((p) => [p.id, p]));
  const input = {
    parts: scene.parts,
    project,
    measures,
    purchases: options.purchases ?? {},
    servoOutputs: scene.servoOutputs ?? {},
    chains: geometry.chains,
    servoTouches: [
      ...new Set(
        cache.pairsWithin(placement, servoTouchPairs(scene.parts, measures), SERVO_TOUCH_MM).map(([id]) => id),
      ),
    ],
    print,
    supportG,
    printDowns: Object.fromEntries(print.parts.map((p) => [p.id, p.check.pose.down])),
    sweep: (spec: SweepSpec) => cache.sweep(placement, spec),
    payload: payloadMap,
    strength: (jobs: Parameters<typeof strengthOf>[3][]) =>
      jobs.map((job) => {
        const p = byId.get(job.part);

        return p ? strengthOf(p.solid, String(cache.solidKey(p.solid)), p.matrix.toArray(), job) : null;
      }),
  };
  const report = runEngineering(input);
  const bom = buildBom(input);
  const fits = designedFits(cache.interference(placement), scene.parts, geometry.chains);
  const findings = [
    ...assemblyFindings(assemblyReport(scene.parts, geometry)),
    ...engineeringFindings(report),
    ...fitFindings(fits.items),
    ...printFindings(print),
    ...bomFindings(bom),
    ...sourcingFindings(bom),
    ...unprintableFindings(scene.parts),
    ...fitProbeFindings(geometry, scene.parts),
    ...threadFindings(geometry, scene.parts),
    ...hiddenFindings(scene.parts),
    ...fixedMateFindings(scene.parts),
    ...goneMateFindings(project.joints),
  ];
  const readiness = readinessOf(findings, { parts: scene.parts, fingerprint: '', rows: report.rows });
  const row = gradeStudyReport({ ...scene, measures }, options, report);
  const checks = studyChecks(readiness);

  if (geometry.timedOut)
    checks.push({ check: 'Checks', status: 'fail', detail: 'The assembly checks reached their time limit.', ids: [] });

  return {
    ...row,
    checks: [...checks, ...row.checks.filter((check) => !!check.caseId)],
    costUsd: bom.totals.estimatedUsd,
  };
}

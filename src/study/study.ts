import { caseRow } from '../readiness/caseChecks';
import { supplyVolts } from '../cases/exploreDesigns';
import { robotTotals } from '../cases/caseCompare';
import { sizeActuators } from '../utils/actuatorSizing';
import { sizingJoints } from '../utils/actuatorSizingInput';
import { servosUsd } from '../utils/designSweep';
import { reportMetrics } from '../utils/designSweepTable';
import type { EngineeringReport } from '../utils/engineeringTypes';
import { runEngineering, robotWeight } from '../utils/engineering';
import { batteryRuntimeMinutes, servoParts } from '../utils/engineeringPower';
import { errorMessage } from '../utils/errorMessage';
import { readinessFingerprint } from '../readiness/readiness';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { StudyGradeOptions, StudyOptions, StudyRow, StudyScene } from './types';
import { enumerateStudy, studyKey, studyLabel } from './combinations';
import { studyScene } from './scene';

export { enumerateStudy, studyKey, studyLabel, studyCatalogLabel, MAX_STUDY_ROWS } from './combinations';
export { studyScene } from './scene';
export { defaultStudyKnobs } from './defaults';
export type * from './types';

const fingerprints = new WeakMap<ScenePart[], WeakMap<ProjectSettings, string>>();

export function studyFingerprint(parts: ScenePart[], project: ProjectSettings): string {
  const byProject = fingerprints.get(parts) ?? new WeakMap<ProjectSettings, string>();
  const kept = byProject.get(project);

  if (kept) return kept;

  const settings = { ...project };

  delete settings.study;

  const key = readinessFingerprint(parts, {
    project: settings,
    transforms: parts.map((part) => [part.id, part.position, part.rotation, part.cameraLens, part.mates, part.frame]),
  });

  byProject.set(project, key);
  fingerprints.set(parts, byProject);

  return key;
}

export function gradeStudy(scene: StudyScene, options: StudyGradeOptions): StudyRow {
  const input = { ...scene, servoOutputs: scene.servoOutputs ?? {}, purchases: options.purchases ?? {} };

  return gradeStudyReport(scene, options, runEngineering(input));
}

export function gradeStudyReport(scene: StudyScene, options: StudyGradeOptions, report: EngineeringReport): StudyRow {
  const input = { ...scene, servoOutputs: scene.servoOutputs ?? {}, purchases: options.purchases ?? {} };
  const sized = sizingJoints(report, scene.parts, scene.project.joints ?? []);
  const sizedUsd = sized.length
    ? sizeActuators({ joints: sized, totalG: report.massG }).find((f) => !f.failures.length)?.costUsd
    : undefined;
  const weighed = robotWeight(input);
  const runtimeMinutes = batteryRuntimeMinutes({
    input,
    parts: scene.parts,
    project: scene.project,
    measures: scene.measures,
    joints: scene.project.joints ?? [],
    byPart: new Map(scene.parts.map((p) => [p.id, p])),
    byId: weighed.byId,
    all: weighed.all,
    onFloor: weighed.bodies.flatMap((b) => b.feet),
    servos: servoParts(scene.parts),
    bodies: weighed.bodies,
  });

  return {
    key: studyKey(options.selection),
    sceneKey: studyFingerprint(scene.parts, scene.project),
    selection: options.selection,
    label: studyLabel(options.knobs, options.selection),
    checks: [
      ...report.rows,
      ...(options.checks ?? []),
      ...(options.runs ? [caseRow(options.kase ?? { id: 'study-case', name: 'Case' }, options.runs)] : []),
    ],
    ...robotTotals(scene, options.purchases ?? {}),
    massG: report.massG,
    runtimeMinutes,
    volts: supplyVolts(scene.parts, scene.project),
    runs: options.runs,
    metrics: reportMetrics(report, { servosUsd: servosUsd(scene.parts, scene.project.joints ?? []), sizedUsd }),
  };
}

async function studyRow(base: StudyScene, options: StudyOptions, selection: number[]): Promise<StudyRow> {
  try {
    const scene = await studyScene(base, options.knobs, selection, options);
    const runs = await options.runs?.(scene);
    const gradeOptions = { knobs: options.knobs, selection, purchases: options.purchases, runs };

    return options.grade ? await options.grade(scene, gradeOptions) : gradeStudy(scene, gradeOptions);
  } catch (error) {
    const detail = errorMessage(error);

    return {
      key: studyKey(selection),
      selection,
      sceneKey: '',
      label: studyLabel(options.knobs, selection),
      error: detail,
      checks: [{ check: 'Study', status: 'fail', detail }],
      costUsd: 0,
      massG: 0,
      metrics: { massG: 0, torque: 'not run' },
    };
  }
}

export async function runStudy(base: StudyScene, options: StudyOptions): Promise<StudyRow[]> {
  const rows: StudyRow[] = [];

  for (const selection of enumerateStudy(options.knobs, options)) {
    if (options.stopped?.()) break;

    const row = await studyRow(base, options, selection);

    if (options.stopped?.()) break;

    rows.push(row);
    options.onRow?.(row);
  }

  return rows;
}

function values(row: StudyRow) {
  return [
    row.costUsd,
    row.massG,
    -(row.runtimeMinutes ?? 0),
    -(row.runs ? row.runs.passes / Math.max(1, row.runs.runs) : 0),
    -(row.runs?.medianMargin ?? 0),
  ];
}

function dominates(a: StudyRow, b: StudyRow): boolean {
  const first = values(a);
  const second = values(b);

  return first.every((value, i) => value <= second[i]) && first.some((value, i) => value < second[i]);
}

export function paretoFrontier(rows: StudyRow[]): string[] {
  const passing = rows.filter((row) => !row.checks.some((check) => check.status === 'fail') && !row.runs?.refusal);

  return passing.filter((row) => !passing.some((other) => dominates(other, row))).map((row) => row.key);
}

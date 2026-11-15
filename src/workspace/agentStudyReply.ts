import type { CaseRuns, RunOutcome } from '../cases/caseRuns';
import type { CheckRow } from '../utils/engineeringTypes';
import { toCad } from '../agent/agentScene';
import { studyLabel } from '../study/study';
import { componentVariant, COMPONENT_BY_ID } from '../data/components';
import { supplyVolts } from '../cases/exploreDesigns';
import type { Case } from '../cases/schema';
import type { StudyKnob, StudyRow } from '../study/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sweepTable } from '../utils/designSweepTable';
import { prettyJointName } from '../utils/kinematics';
import type { StudyResult } from './useStudy';

const round = (value: number, places: number) => Number(value.toFixed(places));
const mpn = (componentId: string | undefined, variant: string | undefined) => {
  const component = componentId ? COMPONENT_BY_ID[componentId] : undefined;

  return (component && componentVariant(component, variant)?.mpn) ?? component?.mpn ?? componentId ?? '';
};

function servoChoice(knobs: StudyKnob[], row: StudyRow, joint: RobotJoint, parts: ScenePart[]) {
  const knobIndex = knobs.findIndex((knob) => knob.kind === 'servo' && knob.joints.includes(joint.id));
  const knob = knobs[knobIndex];
  const index = row.selection[knobIndex];

  if (knob?.kind === 'servo' && index >= 0) {
    const [componentId, variant] = knob.values[index].replace(/^component:/, '').split('|');

    return mpn(componentId, variant);
  }

  const part = parts.find((part) => joint.actuators?.includes(part.id));

  return mpn(part?.componentId, part?.componentVariant);
}

function rowSupply(result: StudyResult, row: StudyRow) {
  return row.volts ?? supplyVolts(result.base.parts, result.base.project);
}

function rowServos(result: StudyResult, row: StudyRow) {
  return (result.base.project.joints ?? [])
    .filter((joint) => joint.actuators?.length)
    .map((joint) => ({
      joint: prettyJointName(joint.name),
      mpn: servoChoice(row.key === result.current.key ? [] : result.knobs, row, joint, result.base.parts),
    }));
}

function compactCheck(check: CheckRow): CheckRow {
  const compact = { ...check };

  delete compact.dots;
  delete compact.envelopes;

  return compact;
}

function compactOutcome(outcome: RunOutcome) {
  const compact: Omit<RunOutcome, 'path'> & { path?: Float32Array } = { ...outcome };

  delete compact.path;

  return compact;
}

function compactRuns(runs: CaseRuns) {
  return { ...runs, outcomes: runs.outcomes.map(compactOutcome) };
}

function compactStudyRow(row: StudyRow) {
  const { costUsd, massG, metrics, runtimeMinutes, volts, runs, ...identity } = row;
  const measurements = row.error
    ? {}
    : {
        costUsd,
        massG,
        metrics,
        runtimeMinutes,
        volts,
        ...(runs ? { runs: compactRuns(runs) } : {}),
      };

  return { ...identity, checks: row.checks.map(compactCheck), ...measurements };
}

function designReply(result: StudyResult, row: StudyRow) {
  const baseline = rowServos(result, result.current);
  const servos = rowServos(result, row);
  const changes = servos.flatMap((servo, i) =>
    servo.mpn === baseline[i]?.mpn ? [] : [{ joints: [servo.joint], mpn: servo.mpn }],
  );
  const identity = {
    key: row.key,
    servos: row.key === result.current.key ? 'current design' : row.label,
    changes,
    checks: row.checks.map(compactCheck),
    ...(row.key === result.current.key ? { current: true } : {}),
  };

  if (row.error) return { ...identity, error: row.error };

  return {
    ...identity,
    volts: rowSupply(result, row),
    passes: row.runs?.passes,
    worst_margin: row.runs ? round(row.runs.worstMargin, 3) : undefined,
    cost_usd: round(row.costUsd, 2),
    mass_g: Math.round(row.massG),
    metrics: row.metrics,
    runtime_minutes: row.runtimeMinutes,
    ...(row.runs?.refusal ? { refusal: row.runs.refusal } : {}),
  };
}

function replyText(result: StudyResult) {
  const errors = result.rows.filter((row) => row.error).map((row) => `${row.label}: ${row.error}`);
  const table =
    result.current.error ??
    sweepTable(
      result.current,
      result.rows.filter((row) => !row.error),
    );

  return [table, ...errors].join('\n');
}

export function studyReply(record: StudyResult, kase: Case | null) {
  const knobs = record.knobs.map((knob) =>
    knob.kind === 'battery_offset' ? { ...knob, values: knob.values.map(toCad) } : knob,
  );
  const result = {
    ...record,
    knobs,
    rows: record.rows.map((row) => ({
      ...row,
      label: knobs.some((knob) => knob.kind === 'battery_offset') ? studyLabel(knobs, row.selection) : row.label,
    })),
  };
  const rows = [result.current, ...result.rows.filter((row) => row.key !== result.current.key)];
  const sorted = [...rows].sort(
    (a, b) =>
      Number(!!a.error) - Number(!!b.error) || (b.runs?.passes ?? 0) - (a.runs?.passes ?? 0) || a.costUsd - b.costUsd,
  );

  return {
    ok: true,
    ...(kase ? { case: kase.name, runs: result.current.runs?.runs ?? rows.find((row) => row.runs)?.runs?.runs } : {}),
    text: replyText(result),
    current: {
      servos: rowServos(result, result.current),
      volts: rowSupply(result, result.current),
      ...(result.current.error ? { error: result.current.error } : { metrics: result.current.metrics }),
    },
    designs: sorted.map((row) => designReply(result, row)),
    rows: result.rows.map(compactStudyRow),
    knobs: result.knobs,
    seed: result.seed,
  };
}

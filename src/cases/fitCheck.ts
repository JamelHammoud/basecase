import {
  driveAccess,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
} from '../sim/driveAccess';
import type { DriveCommand } from '../sim/driveTypes';
import type { Controller, SimStats } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotMorphology } from '../sim/morphology';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { buildRig } from '../utils/kinematics';
import { robotFacts } from './robotFit';
import { caseSlots, type Case } from './schema';
import { slotRefusals, type SlotRobot } from './slots';
import { errorMessage } from '../utils/errorMessage';

export type FitState = 'pass' | 'fail' | 'skip';

export interface FitRow {
  id: 'compile' | 'settle' | 'body' | 'fall' | 'slot';
  label: string;
  state: FitState;
  detail: string;
}

export interface FitRun {
  model: SimModel;
  controller: Controller;
  seconds: number;
  commands?: Array<{ at: number; command: DriveCommand }>;
}

export interface FitInput {
  kase: Case | null;
  rig: Rig;
  parts: ScenePart[];
  partners?: SlotRobot[];
  build: () => Promise<SimModel>;
  run: (r: FitRun) => Promise<SimStats>;
}

const SETTLE_SECONDS = 1.5;

const BODY_WORDS: Record<RobotMorphology, string> = {
  fixed: 'Fixed base',
  legged: 'Legs',
  wheeled: 'Wheels',
  'wheel-legged': 'Wheels on legs',
};

function restHeight(model: SimModel): number {
  const robot = model.robots[0];
  const body = model.bodies.find((b) => b.name === robot?.root);
  const lift = robot ? (model.initial.roots?.[robot.key]?.position?.[1] ?? 0) : 0;

  return ((body?.origin[1] ?? 0) + lift) / 1000;
}

async function fallRow(input: FitInput, model: SimModel): Promise<FitRow> {
  const access = driveAccess({ rig: input.rig, parts: input.parts, model });
  const label = 'Fall check';

  if (access.kind !== 'ready' || !access.needsFallCheck)
    return { id: 'fall', label, state: 'skip', detail: 'Not needed' };

  const stats = await input.run({
    model,
    controller: { kind: 'drive', setup: access.setup },
    seconds: FALL_CHECK_SECONDS + FALL_CHECK_SETTLE_SECONDS,
    commands: fallCheckCommands(),
  });
  const passed = fallCheckPassed(stats, restHeight(model));

  return { id: 'fall', label, state: passed ? 'pass' : 'fail', detail: passed ? 'Walks 5 s' : 'Falls on its walk' };
}

export async function checkFit(input: FitInput): Promise<FitRow[]> {
  const facts = robotFacts(input.rig, input.parts);
  const others = (input.partners ?? []).map((r) => robotFacts(buildRig(r.joints, r.parts), r.parts));
  const slot = input.kase ? slotRefusals(caseSlots(input.kase), [facts, ...others]).find(Boolean) : null;
  const rows: FitRow[] = [];

  if (input.kase)
    rows.push({ id: 'slot', label: 'Fits this Case', state: slot ? 'fail' : 'pass', detail: slot ? 'No' : 'Yes' });

  let model: SimModel;

  try {
    model = await input.build();
  } catch (e) {
    return [...rows, { id: 'compile', label: 'Compiles', state: 'fail', detail: errorMessage(e) }];
  }

  rows.push({ id: 'compile', label: 'Compiles', state: 'pass', detail: `${model.joints.length} joints` });

  const settle = await input.run({ model, controller: { kind: 'hold' }, seconds: SETTLE_SECONDS });
  const fell = settle.robots.find((r) => r.fellAt !== null);

  rows.push({
    id: 'settle',
    label: 'Settles',
    state: fell ? 'fail' : 'pass',
    detail: fell ? `Fell at ${fell.fellAt!.toFixed(1)} s` : 'Stays up',
  });
  rows.push({ id: 'body', label: 'Body', state: 'pass', detail: BODY_WORDS[facts.morphology] });
  rows.push(await fallRow(input, model));

  return rows;
}

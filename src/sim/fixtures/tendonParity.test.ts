import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  closeNativeContactReplays,
  nativeContactReplay,
  prepareNativeContactReplay,
} from '../../../tools/sim/nativeContactReplay.mjs';
import { replayDifferences } from '../../../tools/sim/contactReplayComparison.mjs';
import { tendonMechanism, tendonMechanisms } from './tendonMechanisms';
import { captureContactReplay } from './contactReplay';
import { SimEngine } from '../engine';
import { withTendons } from '../../joints/tendons';
import { buildRig } from '../../utils/kinematics';
import { buildMjcf } from '../mjcf';
import type { ContactReplay } from './contactReplay';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
  await prepareNativeContactReplay(mj.mj_versionString());
});

afterAll(closeNativeContactReplays);

async function compareNative(replay: ContactReplay) {
  const started = performance.now();
  const native = await nativeContactReplay(replay, mj.mj_versionString());
  const differences = replayDifferences(replay, native.cases[0]);

  expect(native.version).toBe(mj.mj_versionString());
  expect(differences.drift).toBeLessThan(1e-6);
  expect(differences.contactDifferences).toBe(0);
  process.stdout.write(
    JSON.stringify({ mechanism: replay.name, nativeReplayMs: performance.now() - started, ...differences }),
  );
}

it.each(tendonMechanisms)('replays ideal tendon $name in pinned native C and WASM', async (spec) => {
  const { model } = tendonMechanism(spec);
  const capture = captureContactReplay(mj);
  const engine = new SimEngine(capture.module, model);

  try {
    engine.setController({
      kind: 'hold',
      values: Object.fromEntries(model.joints.filter((j) => j.actuator >= 0).map((j, i) => [j.id, 20 - i * 10])),
    });
    engine.step(0.5);

    const replay = capture.finish(`tendon-${spec.name}`, model);

    await compareNative(replay);
  } finally {
    engine.dispose();
  }
});

it('replays a spring returning a limp catalog motor and passive wrist', async () => {
  const { model } = tendonMechanism(tendonMechanisms[1]);
  const capture = captureContactReplay(mj);
  const engine = new SimEngine(capture.module, model);

  try {
    engine.reset({ values: { output_0: 30, motor_0: 30 } });
    engine.setController({ kind: 'limp' });
    engine.step(3);
    expect(Math.abs(engine.jointAngles()[0])).toBeLessThan(0.15);
    await compareNative(capture.finish('tendon-spring-return', model));
  } finally {
    engine.dispose();
  }
});

it('replays underactuated load redistribution with a saturated catalog motor', async () => {
  const { model } = tendonMechanism(tendonMechanisms[2]);
  const capture = captureContactReplay(mj);
  const engine = new SimEngine(capture.module, model);

  try {
    engine.data.qfrc_applied[0] = -0.015;
    engine.data.qfrc_applied[2] = -100;
    engine.setController({ kind: 'hold', values: { motor_0: 90 } });
    engine.step(0.5);
    expect(Math.abs(engine.data.actuator_force[0])).toBeCloseTo(model.joints[2].effort, 5);
    await compareNative(capture.finish('tendon-loaded-saturation', model));
  } finally {
    engine.dispose();
  }
});

it('replays an elastic law with independently specified signed virtual-work forces', async () => {
  const { input } = tendonMechanism(tendonMechanisms[2]);
  const tendon = input.rig.byId.get('motor_0')!.tendon!;
  const project = withTendons(input.project, input.parts, [
    {
      motor: 'motor_0',
      tendon: {
        ...tendon,
        terms: tendon.terms.map((term, i) => ({ ...term, coefficient: i === 0 ? -10 : 15 })),
        law: { kind: 'elastic', restLengthMm: 0, stiffnessNPerMm: 0.4, dampingNsPerMm: 0.01 },
      },
    },
  ]);
  const model = buildMjcf({ ...input, project, rig: buildRig(project.joints, input.parts) });
  const capture = captureContactReplay(mj);
  const engine = new SimEngine(capture.module, model);

  try {
    engine.reset({ values: { output_0: 10, output_1: 20, motor_0: 30 } });
    engine.setController({ kind: 'limp' });

    const coefficients = [-0.01, 0.015, -0.01];
    const length = coefficients.reduce((sum, c, i) => sum + c * engine.data.qpos[i], 0);

    coefficients.forEach((c, i) => expect(engine.data.qfrc_passive[i]).toBeCloseTo(c * -400 * length, 12));
    engine.step(0.5);
    await compareNative(capture.finish('tendon-elastic-virtual-work', model));
  } finally {
    engine.dispose();
  }
});

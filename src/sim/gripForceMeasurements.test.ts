import { mkdirSync, writeFileSync } from 'node:fs';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { fixtureRobots } from './fixtures/robots';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { buildRig } from '../utils/kinematics';
import { runCase } from '../cases/testing';
import { forcePickProbes } from '../cases/pickForce';
import { observeCaseForces } from '../cases/gripForce';
import { encodeRecording } from '../cases/recordingFile';
import { SimEngine } from './engine';
import { Recorder, type Recording } from './recorder';
import type { SimModel } from './mjcfTypes';
import type { Case } from '../cases/schema';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function replay(input: { kase: Case; model: SimModel; recording: Recording; observe: boolean }) {
  const { kase, model, recording, observe } = input;
  const engine = new SimEngine(mj, model);

  try {
    engine.setState(recording.qpos.subarray(0, recording.nq));

    if (observe) observeCaseForces(engine, kase, { robot: ['finger_left', 'finger_right'] });

    const recorder = new Recorder(engine);

    const startedMemory = process.memoryUsage();
    let peakRss = startedMemory.rss;
    let peakHeap = startedMemory.heapUsed;
    let measuredAt = 0;

    engine.stepHook = () => {
      recorder.hook();

      if (recorder.length < measuredAt + 100) return;

      measuredAt = recorder.length;

      const memory = process.memoryUsage();

      peakRss = Math.max(peakRss, memory.rss);
      peakHeap = Math.max(peakHeap, memory.heapUsed);
    };
    engine.controlHook = () => {
      const frame = Math.min(recording.frames - 1, Math.floor(engine.data.time / recording.dt));

      engine.data.ctrl.set(recording.ctrl.subarray(frame * recording.nu, (frame + 1) * recording.nu));
    };

    const start = performance.now();

    engine.step((recording.frames - 1) * recording.dt);

    const physicsMs = performance.now() - start;
    const result = recorder.finish();

    return {
      physicsMs,
      workerStartRssBytes: startedMemory.rss,
      workerPeakRssBytes: peakRss,
      workerStartHeapBytes: startedMemory.heapUsed,
      workerPeakHeapBytes: peakHeap,
      contacts: result.contacts,
      offsets: result.contactOffsets,
      bytes: encodeRecording(result).byteLength,
      nativeReservedBytes: engine.model.nbuffer + engine.data.nbuffer + engine.data.narena,
      nativeArenaUsedBytes: engine.data.maxuse_arena,
      observerNumericBytes: observe ? engine.model.nbody * 4 + 48 + 4 * 16 : 0,
      recordedNumericBytes: (result.contactForce?.byteLength ?? 0) + (result.contactForcePeak?.byteLength ?? 0),
      frames: result.frames,
      state: engine.data.qpos.slice(),
    };
  } finally {
    engine.dispose();
  }
}

it.each(selectedPickTargets().map((target) => ({ name: target.id, target })))(
  'measures force extraction, recording and worker physics memory against identical controls for $name',
  async ({ target }) => {
    const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
    const built = buildCase(
      { goal: 'pick', world: 'floor', pickTarget: target },
      builderRobot(buildRig(arm.joints, arm.parts), arm.parts),
    );

    if (!built.ok) throw new Error(built.problem);

    const result = await runCase(mj, built.kase, arm, { controller: 'reference', record: true });
    const kase = {
      ...result.case,
      task: { ...result.case.task, probes: [...result.case.task.probes, ...forcePickProbes(target.id, 20)] },
    };
    const input = { kase, model: result.model, recording: result.recording! };
    const baseline = replay({ ...input, observe: false });
    const observed = replay({ ...input, observe: true });
    const baselineMetrics = { ...baseline, state: undefined, contacts: undefined, offsets: undefined };
    const observedMetrics = { ...observed, state: undefined, contacts: undefined, offsets: undefined };

    expect(observed.state).toEqual(baseline.state);
    expect(observed.contacts).toEqual(baseline.contacts);
    expect(observed.offsets).toEqual(baseline.offsets);
    expect(observed.nativeReservedBytes).toBe(baseline.nativeReservedBytes);
    expect(observed.recordedNumericBytes).toBe(observed.frames * 64);
    mkdirSync('scratch/grip-force-measurements', { recursive: true });
    writeFileSync(
      `scratch/grip-force-measurements/${target.id}.json`,
      JSON.stringify({ name: target.id, baseline: baselineMetrics, observed: observedMetrics }, null, 2),
    );
  },
);

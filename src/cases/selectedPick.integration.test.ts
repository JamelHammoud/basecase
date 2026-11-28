import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { stageCase, stagedEffectors } from './caseCast';
import { decodeRecording, encodeRecording } from './recordingFile';
import { parseCase } from './schema';
import { selectedPickTargets } from './selectedPick.fixtures';
import { runCase } from './testing';
import { scoreTry, trySignals } from './tries';
import { replayTry } from './tryReplay';
import { graspTransitions } from './graspTrace.fixtures';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('selected-object pick through MuJoCo and saved contact evidence', () => {
  it.each(selectedPickTargets().map((target) => ({ name: target.id, target })))(
    'grasps, lifts, places and releases $name without changing its geometry or physics',
    async ({ target }) => {
      const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
      const rig = buildRig(arm.joints, arm.parts);
      const built = buildCase({ goal: 'pick', world: 'floor', pickTarget: target }, builderRobot(rig, arm.parts));

      if (!built.ok) throw new Error(built.problem);

      const started = performance.now();
      const result = await runCase(mj, built.kase, arm, { controller: 'reference', record: true });
      const elapsed = performance.now() - started;
      const recording = decodeRecording(encodeRecording(result.recording!))!;
      const kase = parseCase(JSON.parse(JSON.stringify(result.case)));
      const staged = stageCase(kase, { rig, parts: arm.parts }, []);
      const source = { kase, model: result.model, recording, ...stagedEffectors(staged, { rig, parts: arm.parts }) };
      const signals = trySignals(source);
      const object = kase.world.objects.find((item) => item.id === target.id)!;

      console.info('selected-pick', target.id, { referenceMs: elapsed, frames: recording.frames });
      expect(
        result.passed,
        JSON.stringify({ margin: result.margin, failed: result.failed, contacts: graspTransitions(result.trace) }),
      ).toBe(true);
      expect(object.geometry).toEqual(target);
      expect(object.size).toEqual([target.dimensions.width, target.dimensions.height, target.dimensions.depth]);
      expect(object.massG).toBe(target.massG);
      expect(object.friction).toBe(target.physics!.friction);
      expect(signals.signals.grip.some((value) => value === 1)).toBe(true);
      expect(signals.signals.grip.slice(0, result.trace.signals.grip.length)).toEqual(result.trace.signals.grip);
      expect(recording.contacts!.length).toBeGreaterThan(0);
      expect((await scoreTry(source)).passed).toBe(true);

      const replayed = await replayTry(mj, source, null);

      expect(replayed.passed).toBe(true);
      expect(trySignals({ ...source, recording: replayed.recording }).signals.grip).toEqual(signals.signals.grip);
      expect(
        (
          await scoreTry({
            ...source,
            recording: { ...recording, contacts: undefined, contactOffsets: undefined },
          })
        ).passed,
      ).toBe(false);
    },
  );

  it('stages a scene-selected object as one physical body instead of keeping its source collider too', async () => {
    const target = selectedPickTargets()[0];
    const fixture = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const arm = { ...fixture, parts: [...fixture.parts, target] };
    const rig = buildRig(arm.joints, arm.parts);
    const built = buildCase({ goal: 'pick', world: 'floor', pickTarget: target }, builderRobot(rig, arm.parts));

    if (!built.ok) throw new Error(built.problem);

    const result = await runCase(mj, built.kase, arm, { controller: 'reference', record: true });
    const bodies = result.model.bodies.filter(
      (body) => body.parts.includes(target.id) || body.world?.includes(target.id),
    );

    expect(bodies).toHaveLength(1);
    expect(result.passed).toBe(true);
  });

  it('retains a loose scene object whose id only coincides with an ordinary Case marker', async () => {
    const fixture = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const target = { ...selectedPickTargets()[0], id: 'spot', position: [2000, 10, 2000] as [number, number, number] };
    const arm = { ...fixture, parts: [...fixture.parts, target] };
    const rig = buildRig(arm.joints, arm.parts);
    const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(rig, arm.parts));

    if (!built.ok) throw new Error(built.problem);

    const result = await runCase(mj, built.kase, arm, { controller: 'reference' });

    expect(result.model.bodies.some((body) => body.parts.includes('spot'))).toBe(true);
    expect(result.model.bodies.some((body) => body.world?.includes('spot'))).toBe(true);
    expect(result.passed).toBe(true);
  });
});

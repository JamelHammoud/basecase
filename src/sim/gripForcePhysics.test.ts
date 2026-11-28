import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { hashOf } from '../skills/hash';
import { SimEngine } from './engine';
import { forceFixture, forceFixtureEvidence } from './fixtures/gripForce';
import { LivePhysics } from './livePhysics';
import { Recorder } from './recorder';

it('refreshes force provenance after live physics edits and refuses mixed-physics recording evidence', async () => {
  const mj = await loadMujoco();
  const physics = new LivePhysics();
  const engine = new SimEngine(physics.module(mj), forceFixture());

  try {
    physics.attach(engine);
    engine.observeForces(forceFixtureEvidence());

    const original = engine.forces!;
    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.setController({ kind: 'hold', values: { left: 14, right: 14 } });
    engine.step(0.02);
    physics.apply(mj, { mass: 2, friction: 0.5, strength: 0.8, latencyMs: 0 });
    expect(engine.forces!.evidence.physicsKey).not.toBe(original.evidence.physicsKey);
    expect(engine.forces!.evidence.physicsKey).toBe(
      hashOf({
        mass: Array.from(engine.model.body_mass),
        friction: Array.from(engine.model.geom_friction),
        effort: Array.from(engine.model.actuator_forcerange),
      }),
    );
    engine.step(0.02);

    const mixed = recorder.finish();
    const fresh = new Recorder(engine).finish();

    expect(mixed.forceEvidence).toBeUndefined();
    expect(mixed.contactForce).toBeUndefined();
    expect(mixed.contactForcePeak).toBeUndefined();
    expect(decodeRecording(encodeRecording(mixed))).not.toBeNull();
    expect(fresh.forceEvidence).toEqual(engine.forces!.evidence);
    expect(decodeRecording(encodeRecording(fresh))).toEqual(fresh);
    physics.apply(mj, null);
    expect(engine.forces!.evidence.physicsKey).toBe(original.evidence.physicsKey);
  } finally {
    engine.dispose();
  }
});

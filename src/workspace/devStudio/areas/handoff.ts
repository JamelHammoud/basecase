import * as THREE from 'three';
import { castOf, stageCase } from '../../../cases/caseCast';
import { trySignals } from '../../../cases/tries';
import { loadRecording } from '../../../cases/tryStore';
import { worldDeltas } from '../../../sim/mjcfFrames';
import { framePoses } from '../../../sim/recorder';
import type { Studio } from '../types';

export default function handoffStudio(studio: Studio) {
  return {
    handoffEvidence: async () => {
      const { core } = studio();
      const { cases, sim } = core.simTraining;
      const kase = cases.active;
      const model = sim.model;
      const newest = cases.tries.at(-1);
      const recording = cases.timeline.recording ?? (newest && (await loadRecording(newest.id)));

      if (!kase || !model || !recording) return null;

      const staged = stageCase(kase, { rig: core.posing.rig, parts: core.parts }, cases.partners());
      const cast = castOf(staged, { rig: core.posing.rig, parts: core.parts });
      const block = staged.kase.world.objects.find((o) => o.id === 'block');
      const positions = Array.from({ length: recording.frames }, (_, frame) => {
        const delta = worldDeltas(model, framePoses(recording, frame)).get('block') ?? new THREE.Matrix4();

        return new THREE.Vector3(...(block?.position ?? [0, 0, 0])).applyMatrix4(delta).toArray();
      });
      const trace = trySignals({
        kase: staged.kase,
        model,
        recording,
        rig: cast.rig,
        effector: cast.slots[0]?.effector ?? null,
        effectors: Object.fromEntries(cast.slots.map((s) => [s.id, s.effector])),
      });

      return { ...trace, positions, spot: staged.kase.world.objects.find((o) => o.id === 'spot')?.position ?? null };
    },
  };
}

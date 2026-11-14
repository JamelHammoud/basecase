import * as THREE from 'three';
import { worldDeltas } from '../../../sim/mjcf';
import type { DriveCommand } from '../../../sim/driveTypes';
import { inputEvents } from '../../../sim/inputEvents';
import { feedVoice } from '../../../voice/voiceSession';
import { devSimState } from '../simState';
import type { Studio, StudioContext } from '../types';

type Payload = Record<string, unknown>;

function worldAt({ core, posesRef }: StudioContext) {
  const { model, worldParts } = core.simTraining.sim;
  const deltas = model && posesRef.current ? worldDeltas(model, posesRef.current) : new Map();

  return Object.fromEntries(
    worldParts.map((p) => {
      const at = new THREE.Vector3(...p.position).applyMatrix4(deltas.get(p.id) ?? new THREE.Matrix4());

      return [p.id, at.toArray()];
    }),
  );
}

export default function simStudio(studio: Studio) {
  const sim = () => studio().core.simTraining.sim;

  return {
    simState: () => devSimState(studio().core, studio().jointsRef.current),
    simTool: (kind: string, payload: Payload) => studio().agent.requests.simTool(kind, payload),
    drive: (command: DriveCommand) => sim().drive.setKeys(command),
    driveWith: (inputs: string[]) => sim().drive.start(undefined, { inputs }),
    worldAt: () => worldAt(studio()),
    inputEvents: () => inputEvents().map(({ name, value }) => ({ name, value })),
    feedVoice: (samples: number[], sampleRate: number) => feedVoice(samples, sampleRate),
  };
}

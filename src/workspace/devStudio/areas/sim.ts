import * as THREE from 'three';
import { simDeltas } from '../../../sim/mjcfFrames';
import { findPort, worldPort } from '../../../agent/ports';
import { decodeRecording, encodeRecording } from '../../../cases/recordingFile';
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
    selfContactPairs: () => {
      const model = sim().modelNow();
      const contacts = sim().latestContacts() ?? [];
      const pairs: string[][] = [];

      for (let i = 0; model && i + 1 < contacts.length; i += 2) {
        pairs.push([model.bodies[contacts[i]].parts[0], model.bodies[contacts[i + 1]].parts[0]].sort());
      }

      return pairs;
    },
    simRecordingFrame: () => sim().sought()?.frame,
    simPins: () => {
      const { core, posesRef } = studio();
      const model = sim().model;
      const deltas = model && posesRef.current ? simDeltas(model, posesRef.current) : new Map();

      return Object.fromEntries(
        core.docs.partsRef.current.flatMap((part) => {
          const port = findPort(part, 'C');

          if (!port) return [];

          const at = new THREE.Vector3(...worldPort(part, port).position).applyMatrix4(
            deltas.get(part.id) ?? new THREE.Matrix4(),
          );

          return [[part.id, at.toArray()]];
        }),
      );
    },
    recordSimulation: async (on: boolean) => {
      if (on) {
        sim().record();

        return null;
      }

      const recording = await sim().stopRecording();

      return recording ? Array.from(encodeRecording(recording)) : null;
    },
    replaySimulation: async (bytes: number[], frame: number) => {
      const recording = decodeRecording(Uint8Array.from(bytes));

      if (!recording) return;

      sim().pause();
      await sim().scrub(recording);

      const at = frame < 0 ? recording.frames - 1 : frame;

      sim().seek(at);

      return at;
    },
    simState: () => devSimState(studio().core, studio().jointsRef.current),
    simTool: (kind: string, payload: Payload) => studio().agent.requests.simTool(kind, payload),
    drive: (command: DriveCommand) => sim().drive.setKeys(command),
    driveWith: (inputs: string[]) => sim().drive.start(undefined, { inputs }),
    worldAt: () => worldAt(studio()),
    inputEvents: () => inputEvents().map(({ at, name, value }) => ({ at, name, value })),
    feedVoice: (samples: number[], sampleRate: number) => feedVoice(samples, sampleRate),
  };
}

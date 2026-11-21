import type { LiveCase } from '../cases/liveCase';
import { sha256Hex } from '../skills/hash';
import type { Controller, SimEngine } from './engine';
import type { LivePhysics } from './livePhysics';
import { Recorder, recordingTransfer, type Recording } from './recorder';
import type { SimResponse } from './simMessages';
import type { WorldMoves } from './worldMoves';

export function liveRecorder(input: {
  engine: SimEngine;
  controller: Controller;
  world: WorldMoves | null;
  kase: LiveCase | null;
  physics: () => ReturnType<LivePhysics['snapshot']>;
}) {
  const source = input.kase?.continuationSource();
  const checkpoints =
    source && input.world
      ? {
          caseHash: sha256Hex(JSON.stringify(source)),
          seconds: source.task.seconds,
          deadline: input.kase?.continuationDeadline,
          world: input.world,
          physics: input.physics,
        }
      : undefined;
  const recorder = new Recorder(input.engine, input.controller, input.world, checkpoints);

  input.engine.stepHook = recorder.hook;
  input.engine.commandHook = recorder.command;
  input.engine.continuationHook = recorder.continuationHook;
  input.engine.controlHook = input.engine.teachingSource() ? recorder.control : null;

  return recorder;
}

export function sendRecording(
  post: (message: SimResponse, transfer: Transferable[]) => void,
  recording: Recording | null,
  recordId?: number,
) {
  post(
    { type: 'recorded', recording, ...(recordId === undefined ? {} : { recordId }) },
    recording ? recordingTransfer(recording) : [],
  );
}

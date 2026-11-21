import type { Case } from '../cases/schema';
import type { CaseFacts, FactValue } from '../cases/caseFacts';
import type { LiveCaseInput } from '../cases/liveCase';
import type { WorldChange, WorldLooks } from '../cases/worldSet';
import type { LiveRoutineInput, LiveUpdate } from '../routines/routineLive';
import type { WatchInput } from '../skills/liveWatch';
import type { RobotPoseState } from '../types/robotics';
import type { VisionResult } from '../vision/types';
import type { ContinuationPoint, ContinuationTakeover } from './continuationSession';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimEngine } from './engine';
import type { FallPlan, FallRun } from './fallRuns';
import type { FaultKind } from './faults';
import type { SimPhysics } from './livePhysics';
import type { SimModel } from './mjcf';
import type { RecordedEfforts } from './recordedFrames';
import type { Recording } from './recorder';
import type { Scan } from './scanner';
import type { RunRequest, RunResult } from './simRun';

export type SimRequest =
  | { type: 'load'; model: SimModel; controller?: Controller; loadId?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'reset'; initial?: RobotPoseState }
  | { type: 'speed'; value: number }
  | { type: 'controller'; controller: Controller }
  | { type: 'push'; robot: string; force: [number, number, number]; seconds?: number; releaseDeg?: number }
  | ({ type: 'command' } & DriveCommand)
  | { type: 'script'; commands: Array<{ at: number; command: DriveCommand }> }
  | { type: 'respawn'; robot?: string }
  | { type: 'fault'; joint: string; kind: FaultKind | null }
  | { type: 'record'; on: boolean }
  | { type: 'scrub'; recording: Recording | null; efforts?: RecordedEfforts }
  | { type: 'seek'; frame: number }
  | { type: 'branch'; id?: number; selection: number; frame: number; kase: Case; bytes?: Uint8Array }
  | { type: 'grab'; phase: 'start'; body: number; point: [number, number, number] }
  | { type: 'grab'; phase: 'move'; point: [number, number, number]; turn: [number, number, number, number] | null }
  | { type: 'grab'; phase: 'end' }
  | ({ type: 'run' } & RunRequest)
  | ({ type: 'falls'; id: number } & FallPlan)
  | ({ type: 'routine' } & LiveRoutineInput)
  | { type: 'vision'; result: VisionResult; ageMs: number }
  | ({ type: 'case' } & LiveCaseInput)
  | { type: 'caseEnd' }
  | { type: 'watch'; watch: WatchInput | null }
  | { type: 'input'; name: string; value: FactValue }
  | { type: 'world'; change: WorldChange }
  | { type: 'cameras'; port: MessagePort | null }
  | { type: 'physics'; physics: SimPhysics | null }
  | { type: 'dispose' };

export type SimResponse =
  | ({ type: 'routine' } & LiveUpdate)
  | { type: 'ready'; nq: number; nu: number; nbody: number; loadId?: number }
  | { type: 'error'; message: string; id?: number; loadId?: number }
  | { type: 'recorded'; recording: Recording | null }
  | { type: 'scrubbed'; efforts: RecordedEfforts | null; selection?: number; checkpoints?: ContinuationPoint[] }
  | { type: 'branched'; id?: number; result: ContinuationTakeover | null }
  | { type: 'sought'; frame: number; qpos: Float64Array }
  | { type: 'world'; looks: WorldLooks }
  | { type: 'watched'; id: number; margin: number }
  | {
      type: 'frame';
      poses: Float64Array;
      joints: Float64Array;
      contacts?: Int32Array;
      stats: ReturnType<SimEngine['stats']>;
      playing: boolean;
      facts?: CaseFacts;
      scan?: Scan;
      physics?: SimPhysics | null;
    }
  | { type: 'fell'; id: number; runs: FallRun[] }
  | ({ type: 'ran' } & RunResult);

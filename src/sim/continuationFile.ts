import { keepTyped, restoreTyped } from '../cases/recordingValues';
import { isHash } from '../skills/hash';
import { boundedInteger, finiteValue, recordValue, vectorValue } from '../study/recordValues';
import type { EngineContinuationState } from './engineContinuation';
import { readEngineContinuation } from './continuationStateReader';
import type { ControlDelayState } from './controlDelay';
import type { WorldMoveState } from './worldMoves';
import { CONTINUATION_MAX_BYTES, CONTINUATION_MAX_POINTS } from './continuationLimits';

export { CONTINUATION_MAX_BYTES, CONTINUATION_MAX_POINTS } from './continuationLimits';

export interface ContinuationCheckpoint {
  frame: number;
  time: number;
  engine: EngineContinuationState;
  world: WorldMoveState;
  physics: { delay: ControlDelayState; active: boolean };
  cursors: { commands: number; faults: number; world: number; inputs: number };
}

export interface ContinuationRecording {
  version: 1;
  caseHash: string;
  started: number;
  deadline: number;
  checkpoints: ContinuationCheckpoint[];
}

const list = (v: unknown, limit: number): v is unknown[] => Array.isArray(v) && v.length <= limit;
const finiteRow = (v: unknown) => v instanceof Float64Array && v.length <= 1024 && v.every(Number.isFinite);

function worldChange(value: unknown): boolean {
  if (!recordValue(value) || typeof value.id !== 'string' || value.id.length > 256) return false;

  const pose = value.pose;
  const positioned =
    pose === undefined ||
    (recordValue(pose) &&
      (pose.position === undefined || vectorValue(pose.position)) &&
      (pose.rotation === undefined || vectorValue(pose.rotation)));
  const color = value.color;

  return (
    positioned &&
    (value.visible === undefined || typeof value.visible === 'boolean') &&
    (color === undefined || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)))
  );
}

function worldState(value: unknown): boolean {
  if (!recordValue(value) || !list(value.changes, 256) || !list(value.hidden, 256)) return false;

  return (
    value.changes.every(worldChange) &&
    value.hidden.every(
      (pair) =>
        list(pair, 2) &&
        pair.length === 2 &&
        typeof pair[0] === 'string' &&
        pair[0].length <= 256 &&
        finiteRow(pair[1]) &&
        (pair[1] as Float64Array).length === 7,
    )
  );
}

function delayState(value: unknown): boolean {
  if (!recordValue(value) || !boundedInteger(value.count, 10_000) || !boundedInteger(value.next, value.count as number))
    return false;

  const history = value.history;

  return (
    list(history, (value.count as number) + 1) &&
    (history.length === (value.count as number) + 1 || value.next === history.length) &&
    (value.count !== 0 || history.length === 0) &&
    history.every(finiteRow) &&
    history.every((row) => (row as Float64Array).length === (history[0] as Float64Array).length)
  );
}

function cursors(value: unknown): boolean {
  if (!recordValue(value)) return false;

  return ['commands', 'faults', 'world', 'inputs'].every((key) => boundedInteger(value[key], 1_000_000));
}

function checkpoint(value: unknown): value is ContinuationCheckpoint {
  if (!recordValue(value) || !boundedInteger(value.frame, 30_000) || !finiteValue(value.time) || value.time < 0)
    return false;

  const physics = value.physics;

  return (
    !!readEngineContinuation(value.engine) &&
    worldState(value.world) &&
    cursors(value.cursors) &&
    recordValue(physics) &&
    typeof physics.active === 'boolean' &&
    delayState(physics.delay)
  );
}

function readValue(value: unknown): ContinuationRecording | null {
  if (!recordValue(value) || value.version !== 1 || !isHash(value.caseHash)) return null;

  if (
    !finiteValue(value.started) ||
    !finiteValue(value.deadline) ||
    value.started < 0 ||
    value.deadline <= value.started
  )
    return null;

  const checkpoints = value.checkpoints;

  if (!list(checkpoints, CONTINUATION_MAX_POINTS) || !checkpoints.length || !checkpoints.every(checkpoint)) return null;

  const started = value.started;
  const seconds = value.deadline - started;
  const ordered = checkpoints.every(
    (point, i) =>
      point.time <= seconds &&
      Math.abs(point.engine.integration[0] - started - point.time) < 1e-8 &&
      (!i || (point.frame > checkpoints[i - 1].frame && point.time > checkpoints[i - 1].time)),
  );

  return ordered ? (value as unknown as ContinuationRecording) : null;
}

export function encodeContinuation(value: ContinuationRecording): Uint8Array | null {
  const text = JSON.stringify(value, keepTyped);

  if (text.length > CONTINUATION_MAX_BYTES) return null;

  const bytes = new TextEncoder().encode(text);

  return bytes.byteLength <= CONTINUATION_MAX_BYTES ? bytes : null;
}

export function readContinuation(bytes: Uint8Array): ContinuationRecording | null {
  if (!bytes.byteLength || bytes.byteLength > CONTINUATION_MAX_BYTES) return null;

  try {
    return readValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), restoreTyped));
  } catch {
    return null;
  }
}

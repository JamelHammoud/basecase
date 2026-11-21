import { readWorldChange, type WorldChange } from '../cases/worldSet';
import type { SimEngine } from './engine';
import { FAULT_KINDS, type FaultKind, type RecordedFault } from './faults';
import type { ContinuationCheckpoint } from './continuationFile';
import type { Recording } from './recorder';
import type { WorldMoves } from './worldMoves';

type Event =
  | { at: number; kind: 'fault'; joint: string; fault: FaultKind | null }
  | { at: number; kind: 'world'; change: WorldChange };

const finiteTime = (at: number) => Number.isFinite(at) && at >= 0 && at <= 600;
const FAULTS = new Set(FAULT_KINDS);

function validFault(fault: RecordedFault): boolean {
  return (
    FAULTS.has(fault.kind) &&
    finiteTime(fault.at) &&
    (fault.until === undefined || (finiteTime(fault.until) && fault.until >= fault.at))
  );
}

function faultEvents(source: Recording, point: ContinuationCheckpoint, engine: SimEngine): Event[] | null {
  const faults = source.faults ?? [];
  const events: Event[] = [];

  if (faults.length > 30_000 || point.cursors.faults > faults.length) return null;

  for (const [index, fault] of faults.entries()) {
    const joint = engine.sim.joints.find((j) => j.id === fault.joint);

    if (!joint || !validFault(fault)) return null;

    if (index >= point.cursors.faults)
      events.push({ at: fault.at, kind: 'fault', joint: fault.joint, fault: fault.kind });

    const active = point.engine.faults.kinds.some(([id]) => id === joint.actuator);
    const clear = fault.until !== undefined && (fault.until > point.time || (fault.until === point.time && active));

    if (clear) events.push({ at: fault.until!, kind: 'fault', joint: fault.joint, fault: null });
  }

  return events;
}

export function continuationEvents(
  source: Recording,
  point: ContinuationCheckpoint,
  engine: SimEngine,
): Event[] | null {
  if (source.inputs?.length || source.topics || source.scan) return null;

  const faults = faultEvents(source, point, engine);
  const world = source.world ?? [];

  if (!faults || world.length > 30_000 || point.cursors.world > world.length) return null;

  if (!world.every((event) => finiteTime(event.at) && !!readWorldChange({ ...event, name: event.id }))) return null;

  const events: Event[] = [
    ...faults,
    ...world.slice(point.cursors.world).map((change) => ({ at: change.at, kind: 'world' as const, change })),
  ].sort((a, b) => a.at - b.at);
  const ambiguous = events.some(
    (event, i) => i > 0 && Math.abs(event.at - events[i - 1].at) < 1e-9 && event.kind !== events[i - 1].kind,
  );
  const movable = (id: string) => engine.sim.bodies.some((body) => body.moves && body.world?.includes(id));

  if (ambiguous || events.some((event) => event.at < point.time - 1e-9)) return null;

  if (!world.every((event) => movable(event.id))) return null;

  if (!point.world.changes.every((change) => movable(change.id))) return null;

  return point.world.hidden.every(([id]) => movable(id)) ? events : null;
}

export function applyContinuationEvent(
  event: Event,
  host: {
    engine: SimEngine;
    world: WorldMoves;
    recorder: {
      fault: (joint: string, kind: FaultKind | null) => void;
      worldChange: (change: WorldChange) => void;
    };
  },
) {
  if (event.kind === 'fault') {
    host.engine.setFault(event.joint, event.fault);
    host.recorder.fault(event.joint, event.fault);

    return;
  }

  if (host.world.apply(event.change)) return;

  host.recorder.worldChange(event.change);
}

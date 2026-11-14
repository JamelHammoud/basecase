import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';
import { applyRobotEvent, INITIAL_ROBOT, type RobotEvent, type RobotState } from './robotState';

export interface UnitEntry {
  unit: string;
  state: RobotState;
  joints: string[] | null;
  version: string | null;
  previous: string | null;
  hasPrevious: boolean;
}

export interface Fleet {
  selected: string;
  units: UnitEntry[];
}

export const unitOfEvent = (event: RobotEvent) => (typeof event.unit === 'string' ? event.unit : DEFAULT_UNIT);

export const unitEntry = (unit: string): UnitEntry => ({
  unit,
  state: INITIAL_ROBOT,
  joints: null,
  version: null,
  previous: null,
  hasPrevious: false,
});

const text = (value: unknown) => (typeof value === 'string' ? value : null);

function versions(entry: UnitEntry, event: RobotEvent) {
  if (event.event === 'policy')
    return { version: text(event.version), previous: text(event.previous), hasPrevious: event.hasPrevious === true };

  if (event.event === 'link' && event.state === 'connected')
    return { version: null, previous: null, hasPrevious: false };

  return { version: entry.version, previous: entry.previous, hasPrevious: entry.hasPrevious };
}

export function withEvent(entry: UnitEntry, event: RobotEvent): UnitEntry {
  const closing = event.event === 'link' && event.state !== 'connected';

  return {
    ...entry,
    ...versions(entry, event),
    state: applyRobotEvent(entry.state, event),
    joints: closing ? null : entry.joints,
  };
}

export function rowKey({ state, version, previous, hasPrevious }: UnitEntry): string {
  const status = state.status;

  return [
    state.link,
    state.name,
    state.mode,
    state.pending,
    status?.run,
    status?.fault_latched,
    state.messages[0]?.id,
    version,
    previous,
    hasPrevious,
  ].join('|');
}

export const isListed = (entry: UnitEntry) => entry.state.link !== 'off';

export const fleetOf = (units: ReadonlyMap<string, UnitEntry>, selected: string): Fleet => ({
  selected,
  units: [...units.values()].filter(isListed).sort((a, b) => a.unit.localeCompare(b.unit)),
});

export const connectedUnits = (fleet: Fleet) => fleet.units.filter((u) => u.state.link === 'connected');

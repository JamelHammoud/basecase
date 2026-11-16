import { isUnitName } from '../../electron/robot/units.mjs';
import { OPERATE_FACT_MAX_AGE_MS } from '../cases/operateConditions';
import type { RobotEvent } from './robotState';

export const MAX_INCIDENTS = 128;
export const MAX_INCIDENT_BYTES = 256 * 1024;

const SAFE_ID = /^[\w-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

export function boundedIncidents(items: FleetIncident[]): FleetIncident[] {
  const kept: FleetIncident[] = [];
  let bytes = 2;

  for (const item of items.slice(0, MAX_INCIDENTS)) {
    bytes += byteLength(JSON.stringify(item)) + Number(kept.length > 0);

    if (bytes > MAX_INCIDENT_BYTES) break;

    kept.push(item);
  }

  return kept;
}

function remember<K, V>(map: Map<K, V>, key: K, value: V) {
  map.delete(key);
  map.set(key, value);

  if (map.size > MAX_INCIDENTS) map.delete(map.keys().next().value!);
}

export interface IncidentContext {
  session: string | null;
  sceneId: string | null;
  modelHash: string | null;
  policyHash: string | null;
}

export interface FleetIncident extends IncidentContext {
  id: string;
  unit: string;
  name: string;
  key: string;
  message: string;
  startedAt: number;
  lastAt: number;
  recoveredAt: number | null;
  acknowledgedAt: number | null;
  active: boolean;
  recording: string | null;
}

interface Occurrence {
  unit: string;
  name?: string;
  key: string;
  message: string;
  context?: unknown;
}

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const matching = (v: unknown, pattern: RegExp) => (typeof v === 'string' && pattern.test(v) ? v : null);
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nullableTime = (v: unknown) => v === null || time(v);

export function incidentContext(value: unknown): IncidentContext {
  const v = object(value);

  return {
    session: matching(v.session, SAFE_ID),
    sceneId: matching(v.sceneId, SAFE_ID),
    modelHash: matching(v.modelHash, HASH),
    policyHash: matching(v.policyHash, HASH),
  };
}

function readIncident(value: unknown): FleetIncident[] {
  const v = object(value);
  const valid =
    matching(v.id, SAFE_ID) &&
    isUnitName(v.unit) &&
    time(v.startedAt) &&
    time(v.lastAt) &&
    nullableTime(v.recoveredAt) &&
    nullableTime(v.acknowledgedAt) &&
    typeof v.active === 'boolean';

  if (!valid || !text(v.key, 256) || !text(v.message, 512)) return [];

  return [
    {
      ...incidentContext(v),
      id: String(v.id),
      unit: String(v.unit),
      name: text(v.name, 128),
      key: text(v.key, 256),
      message: text(v.message, 512),
      startedAt: Number(v.startedAt),
      lastAt: Number(v.lastAt),
      recoveredAt: v.recoveredAt as number | null,
      acknowledgedAt: v.acknowledgedAt as number | null,
      active: v.active === true,
      recording: matching(v.recording, SAFE_ID),
    },
  ];
}

export function readIncidents(raw: string | null): FleetIncident[] {
  if (!raw || raw.length > MAX_INCIDENT_BYTES || byteLength(raw) > MAX_INCIDENT_BYTES) return [];

  try {
    const values: unknown = JSON.parse(raw);

    return Array.isArray(values) ? values.slice(0, MAX_INCIDENTS).flatMap(readIncident) : [];
  } catch {
    return [];
  }
}

export class FleetIncidents {
  items: FleetIncident[];
  private readonly stamps = new Map<string, number>();
  private readonly origins = new Map<string, number>();
  private readonly recoveries = new Map<string, number>();
  private readonly recordings = new Map<string, string>();
  private readonly names = new Map<string, string>();

  constructor(items: FleetIncident[] = []) {
    this.items = boundedIncidents(items);
  }

  condition(ask: Occurrence, active: boolean | null, at: number): boolean {
    if (active === null || !isUnitName(ask.unit) || !time(at)) return false;

    const index = this.items.findIndex((i) => i.unit === ask.unit && i.key === ask.key && i.active);
    const previous = this.items[index];

    if (previous && at < previous.lastAt) return false;

    if (!previous && !active) return false;

    if (previous) {
      const context = previous.session ? previous : incidentContext(ask.context);
      const attached = !previous.session && context.session !== null;

      this.items = this.items.map((i, k) =>
        k === index
          ? {
              ...i,
              ...context,
              recording: i.recording ?? this.recordings.get(`${ask.unit}:${context.session}`) ?? null,
              lastAt: at,
              active,
              recoveredAt: active ? null : at,
            }
          : i,
      );

      return !active || attached;
    }

    const context = incidentContext(ask.context);
    const incident: FleetIncident = {
      ...context,
      id: `incident-${at.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      unit: ask.unit,
      name: text(ask.name ?? this.names.get(ask.unit) ?? ask.unit, 128),
      key: text(ask.key, 256),
      message: text(ask.message, 512),
      startedAt: at,
      lastAt: at,
      recoveredAt: null,
      acknowledgedAt: null,
      active: true,
      recording: this.recordings.get(`${ask.unit}:${context.session}`) ?? null,
    };

    this.items = boundedIncidents([incident, ...this.items]);

    return true;
  }

  acknowledge(id: string, at: number): boolean {
    const incident = this.items.find((i) => i.id === id);

    if (!incident || incident.acknowledgedAt !== null || !time(at)) return false;

    this.items = this.items.map((i) => (i.id === id ? { ...i, acknowledgedAt: at } : i));

    return true;
  }

  recover(unit: string, prefix: string, at: number): boolean {
    let changed = false;

    for (const item of this.items.filter((i) => i.unit === unit && i.key.startsWith(prefix) && i.active))
      changed = this.condition({ ...item, context: item }, false, at) || changed;

    return changed;
  }

  recorded(event: RobotEvent): boolean {
    const manifest = object(event.manifest);
    const recording = matching(manifest.id, SAFE_ID);

    if (!recording || recording !== event.id) return false;

    remember(this.recordings, `${event.unit}:${event.id}`, recording);

    let changed = false;

    this.items = this.items.map((i) => {
      if (i.unit !== event.unit || i.session !== event.id || i.recording === recording) return i;

      changed = true;

      return { ...i, recording };
    });

    return changed;
  }

  status(event: RobotEvent, unit: string, at: number): boolean {
    if (typeof event.at_us !== 'number' || !Number.isFinite(event.at_us)) return false;

    if (event.at_us <= (this.stamps.get(unit) ?? -1)) return false;

    remember(this.stamps, unit, event.at_us);

    const sourceAt = event.at_us / 1000;
    const origin = Math.min(this.origins.get(unit) ?? Infinity, at - sourceAt);

    remember(this.origins, unit, origin);

    if (at - (origin + sourceAt) > OPERATE_FACT_MAX_AGE_MS) return false;

    const recovered = event.fault_latched === false ? this.recover(unit, 'fault:', at) : false;

    if (recovered) remember(this.recoveries, unit, event.at_us);

    return recovered;
  }

  fault(event: RobotEvent, unit: string, at: number): boolean {
    if (typeof event.at_us === 'number' && event.at_us <= (this.recoveries.get(unit) ?? -1)) return false;

    if (typeof event.at_us === 'number' && event.at_us < (this.stamps.get(unit) ?? -1)) return false;

    return this.condition(
      {
        unit,
        key: `fault:${text(event.code, 64)}:${String(event.id ?? '')}`,
        message: text(event.message, 512) || 'Robot stopped',
        context: event.context,
      },
      true,
      at,
    );
  }

  event(event: RobotEvent, at: number): boolean {
    const unit = typeof event.unit === 'string' ? event.unit : 'robot';

    if (!isUnitName(unit)) return false;

    if (event.event === 'recorded') return this.recorded({ ...event, unit });

    if (event.event === 'hello') remember(this.names, unit, text(event.name, 128) || unit);

    if (event.event === 'link' && event.state === 'connected') {
      this.stamps.delete(unit);
      this.origins.delete(unit);
      this.recoveries.delete(unit);

      return this.recover(unit, 'connection', at);
    }

    if (event.event === 'link' && event.state === 'lost')
      return this.condition(
        { unit, key: 'connection', message: text(event.message, 512) || 'Robot disconnected', context: event.context },
        true,
        at,
      );

    if (event.event === 'fault') return this.fault(event, unit, at);

    return event.event === 'status' ? this.status(event, unit, at) : false;
  }
}

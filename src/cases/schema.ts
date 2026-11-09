import type { PartKind, ScenePart } from '../types/robotics';
import type { WorldBehavior, WorldItem } from '../sim/mjcfTypes';
import type { V3 } from '../utils/kinematics';
import { readContract, type Contract } from './contract';
import {
  asId,
  asNumber,
  asRecord,
  asString,
  CaseFileError,
  listOf,
  oneOf,
  optional,
  refuse,
  vector,
  type Reader,
} from './validate';

export const CASE_FORMAT_VERSION = 1;

const WORLD_KINDS = ['box', 'cube', 'sphere', 'cylinder', 'wedge', 'cone', 'custom_model'] as const;
const CAPABILITIES = ['arm', 'wheels', 'legs'] as const;
const BEHAVIORS = ['static', 'dynamic', 'marker'] as const;
const CONTROL_INPUTS = ['move', 'turn', 'lift', 'grip'] as const;
const MAX_OBJECTS = 256;
const MAX_COMMANDS = 4096;
const MAX_SECONDS = 600;

export type Capability = (typeof CAPABILITIES)[number];

export interface SlotBinding {
  endEffector?: { part: string; point: V3 };
  wheels?: string[];
  base?: string;
}

export interface RobotSlot {
  needs: Capability[];
  minJoints?: number;
  binding: SlotBinding;
  reachMm?: number;
  anchor?: V3;
}

export interface WorldObject {
  id: string;
  name: string;
  kind: (typeof WORLD_KINDS)[number];
  position: V3;
  rotation: V3;
  size: V3;
  color: string;
  opacity?: number;
  behavior: WorldBehavior;
  massG?: number;
  friction?: number;
}

export interface CaseControl {
  id: string;
  label: string;
  input: (typeof CONTROL_INPUTS)[number];
}

export interface ReferenceCommand {
  at: number;
  v?: V3;
  target?: V3;
  push?: string;
  aux?: number[];
}

export type ProbeEnd = 'end-effector' | 'base' | { object: string } | { point: V3 };

export interface CaseProbe {
  signal: string;
  from: ProbeEnd;
  to: ProbeEnd;
}

export interface CaseTask {
  seconds: number;
  probes: CaseProbe[];
  contract: Contract;
}

export interface Case {
  formatVersion: typeof CASE_FORMAT_VERSION;
  id: string;
  name: string;
  brief: string;
  slot: RobotSlot;
  world: { objects: WorldObject[] };
  controls: CaseControl[];
  reference: { timeline: ReferenceCommand[] };
  task: CaseTask;
}

const v3 = vector(3) as unknown as Reader<V3>;

const readEffector: Reader<NonNullable<SlotBinding['endEffector']>> = (value, where) => {
  const v = asRecord(value, where);

  return { part: asId(v.part, `${where}.part`), point: v3(v.point, `${where}.point`) };
};

const readSlot: Reader<RobotSlot> = (value, where) => {
  const v = asRecord(value, where);
  const b = asRecord(v.binding ?? {}, `${where}.binding`);

  return {
    needs: listOf(oneOf(CAPABILITIES), 8)(v.needs, `${where}.needs`),
    minJoints: optional(asNumber, v.minJoints, `${where}.minJoints`),
    binding: {
      endEffector: optional(readEffector, b.endEffector, `${where}.binding.endEffector`),
      wheels: optional(listOf(asId, 32), b.wheels, `${where}.binding.wheels`),
      base: optional(asId, b.base, `${where}.binding.base`),
    },
    reachMm: optional(asNumber, v.reachMm, `${where}.reachMm`),
    anchor: optional(v3, v.anchor, `${where}.anchor`),
  };
};

const readObject: Reader<WorldObject> = (value, where) => {
  const v = asRecord(value, where);

  return {
    id: asId(v.id, `${where}.id`),
    name: asString(v.name, `${where}.name`),
    kind: oneOf(WORLD_KINDS)(v.kind, `${where}.kind`),
    position: v3(v.position, `${where}.position`),
    rotation: v3(v.rotation, `${where}.rotation`),
    size: v3(v.size, `${where}.size`),
    color: asString(v.color, `${where}.color`),
    opacity: optional(asNumber, v.opacity, `${where}.opacity`),
    behavior: oneOf(BEHAVIORS)(v.behavior, `${where}.behavior`),
    massG: optional(asNumber, v.massG, `${where}.massG`),
    friction: optional(asNumber, v.friction, `${where}.friction`),
  };
};

export const readWorldObjects = (value: unknown): WorldObject[] => {
  const objects = listOf(readObject, MAX_OBJECTS)(value, 'world.objects');

  if (new Set(objects.map((o) => o.id)).size !== objects.length) refuse('world.objects', 'repeats an id');

  return objects;
};

const readControl: Reader<CaseControl> = (value, where) => {
  const v = asRecord(value, where);

  return {
    id: asId(v.id, `${where}.id`),
    label: asString(v.label, `${where}.label`),
    input: oneOf(CONTROL_INPUTS)(v.input, `${where}.input`),
  };
};

const readCommand: Reader<ReferenceCommand> = (value, where) => {
  const v = asRecord(value, where);

  return {
    at: asNumber(v.at, `${where}.at`),
    v: optional(v3, v.v, `${where}.v`),
    target: optional(v3, v.target, `${where}.target`),
    push: optional(asId, v.push, `${where}.push`),
    aux: optional(listOf(asNumber, 8), v.aux, `${where}.aux`),
  };
};

const readProbeEnd: Reader<ProbeEnd> = (value, where) => {
  if (value === 'end-effector' || value === 'base') return value;

  const v = asRecord(value, where);

  return v.object !== undefined ? { object: asId(v.object, `${where}.object`) } : { point: v3(v.point, where) };
};

const readTask: Reader<CaseTask> = (value, where) => {
  const v = asRecord(value, where);
  const seconds = asNumber(v.seconds, `${where}.seconds`);

  if (seconds <= 0 || seconds > MAX_SECONDS) return refuse(`${where}.seconds`, `must be within ${MAX_SECONDS}`);

  return {
    seconds,
    probes: listOf<CaseProbe>((p, at) => {
      const probe = asRecord(p, at);

      return {
        signal: asId(probe.signal, `${at}.signal`),
        from: readProbeEnd(probe.from, `${at}.from`),
        to: readProbeEnd(probe.to, `${at}.to`),
      };
    }, 64)(v.probes, `${where}.probes`),
    contract: readContract(v.contract, `${where}.contract`),
  };
};

export function parseCase(input: unknown): Case {
  const v = asRecord(input, 'A Case file');

  if (v.formatVersion !== CASE_FORMAT_VERSION)
    throw new CaseFileError(`This Case was made with format ${String(v.formatVersion)}. Update Basecase to open it.`);

  const world = asRecord(v.world, 'world');
  const reference = asRecord(v.reference, 'reference');
  const objects = readWorldObjects(world.objects);

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: asId(v.id, 'id'),
    name: asString(v.name, 'name'),
    brief: asString(v.brief, 'brief'),
    slot: readSlot(v.slot, 'slot'),
    world: { objects },
    controls: listOf(readControl, 16)(v.controls, 'controls'),
    reference: { timeline: listOf(readCommand, MAX_COMMANDS)(reference.timeline, 'reference.timeline') },
    task: readTask(v.task, 'task'),
  };
}

export function worldItem(o: WorldObject): WorldItem {
  const part: ScenePart = {
    id: o.id,
    name: o.name,
    kind: o.kind as PartKind,
    category: 'structure',
    role: 'solid',
    position: o.position,
    rotation: o.rotation,
    dimensions: { width: o.size[0], height: o.size[1], depth: o.size[2] },
    color: o.color,
    note: '',
    visible: true,
    locked: true,
    ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
    ...(o.massG !== undefined ? { massG: o.massG } : {}),
    ...(o.friction !== undefined ? { physics: { dynamic: o.behavior === 'dynamic', friction: o.friction } } : {}),
  };

  return { ...part, behavior: o.behavior };
}

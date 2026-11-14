import type { PartKind, ScenePart } from '../types/robotics';
import type { WorldBehavior, WorldItem } from '../sim/mjcfTypes';
import type { V3 } from '../utils/kinematics';
import { consoleReader, type CaseConsole } from './console/format';
import { validateRoutine, type Routine } from '../routines/schema';
import { readContract, type Contract } from './contract';
import { readStore, type CaseStore } from './caseStore';
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
const CAPABILITIES = ['arm', 'gripper', 'wheels', 'legs'] as const;
const BEHAVIORS = ['static', 'dynamic', 'marker'] as const;
const CONTROL_INPUTS = ['move', 'turn', 'lift', 'grip'] as const;

export const MAX_OBJECTS = 256;

const MAX_COMMANDS = 4096;
const MAX_COMMAND_JOINTS = 64;
const MAX_SECONDS = 600;
const SCORE_COUNTS = ['in', 'out'] as const;

export const MAX_SLOTS = 4;

export type Capability = (typeof CAPABILITIES)[number];

export interface SlotBinding {
  endEffector?: { part: string; point: V3 };
  wheels?: string[];
  base?: string;
}

export interface SlotPose {
  position: V3;
  yawDeg: number;
}

export interface RobotSlot {
  id?: string;
  needs: Capability[];
  minJoints?: number;
  binding: SlotBinding;
  reachMm?: number;
  anchor?: V3;
  pose?: SlotPose;
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
  movable?: boolean;
}

export interface CaseControl {
  id: string;
  label: string;
  input: (typeof CONTROL_INPUTS)[number];
}

export interface ReferenceCommand {
  at: number;
  slot?: string;
  v?: V3;
  target?: V3;
  push?: string;
  aux?: number[];
  joints?: Record<string, number>;
}

export type ProbeEnd = 'end-effector' | 'base' | { effector: string } | { object: string } | { point: V3 };

export interface CaseProbe {
  signal: string;
  from: ProbeEnd;
  to: ProbeEnd;
}

export interface ScoreRule {
  spot: string;
  counts: (typeof SCORE_COUNTS)[number];
}

export interface CaseTask {
  seconds: number;
  probes: CaseProbe[];
  contract: Contract;
  score?: ScoreRule;
}

export interface Case {
  formatVersion: typeof CASE_FORMAT_VERSION;
  id: string;
  name: string;
  brief: string;
  slot?: RobotSlot;
  slots?: RobotSlot[];
  world: { objects: WorldObject[] };
  controls: CaseControl[];
  reference: { timeline: ReferenceCommand[] };
  task: CaseTask;
  console?: CaseConsole;
  logic?: Routine;
  store?: CaseStore;
}

const v3 = vector(3) as unknown as Reader<V3>;

const asTrue: Reader<boolean> = (value, where) => (value === true ? true : refuse(where, 'must be true or left out'));

const readEffector: Reader<NonNullable<SlotBinding['endEffector']>> = (value, where) => {
  const v = asRecord(value, where);

  return { part: asId(v.part, `${where}.part`), point: v3(v.point, `${where}.point`) };
};

const readPose: Reader<SlotPose> = (value, where) => {
  const v = asRecord(value, where);

  return { position: v3(v.position, `${where}.position`), yawDeg: asNumber(v.yawDeg, `${where}.yawDeg`) };
};

const readSlot: Reader<RobotSlot> = (value, where) => {
  const v = asRecord(value, where);
  const b = asRecord(v.binding ?? {}, `${where}.binding`);

  return {
    id: optional(asId, v.id, `${where}.id`),
    needs: listOf(oneOf(CAPABILITIES), 8)(v.needs, `${where}.needs`),
    minJoints: optional(asNumber, v.minJoints, `${where}.minJoints`),
    binding: {
      endEffector: optional(readEffector, b.endEffector, `${where}.binding.endEffector`),
      wheels: optional(listOf(asId, 32), b.wheels, `${where}.binding.wheels`),
      base: optional(asId, b.base, `${where}.binding.base`),
    },
    reachMm: optional(asNumber, v.reachMm, `${where}.reachMm`),
    anchor: optional(v3, v.anchor, `${where}.anchor`),
    pose: optional(readPose, v.pose, `${where}.pose`),
  };
};

function readSlots(value: unknown, where: string): RobotSlot[] {
  const slots = listOf(readSlot, MAX_SLOTS)(value, where);
  const ids = slots.map((s, i) => s.id ?? refuse(`${where}[${i}].id`, 'must be a plain id'));

  if (!slots.length) refuse(where, 'must hold a slot');

  if (new Set(ids).size !== ids.length) refuse(where, 'repeats an id');

  return slots;
}

function readCast(v: Record<string, unknown>): Pick<Case, 'slot' | 'slots'> {
  if (v.slots === undefined) return { slot: readSlot(v.slot, 'slot') };

  if (v.slot !== undefined) refuse('slot', 'can’t sit beside slots');

  return { slots: readSlots(v.slots, 'slots') };
}

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
    ...(v.movable === undefined ? {} : { movable: asTrue(v.movable, `${where}.movable`) }),
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

const readJoints: Reader<Record<string, number>> = (value, where) => {
  const entries = Object.entries(asRecord(value, where));

  if (entries.length > MAX_COMMAND_JOINTS) return refuse(where, `holds more than ${MAX_COMMAND_JOINTS} joints`);

  return Object.fromEntries(entries.map(([id, v]) => [asId(id, where), asNumber(v, `${where}.${id}`)]));
};

const readCommand: Reader<ReferenceCommand> = (value, where) => {
  const v = asRecord(value, where);

  return {
    at: asNumber(v.at, `${where}.at`),
    slot: optional(asId, v.slot, `${where}.slot`),
    v: optional(v3, v.v, `${where}.v`),
    target: optional(v3, v.target, `${where}.target`),
    push: optional(asId, v.push, `${where}.push`),
    aux: optional(listOf(asNumber, 8), v.aux, `${where}.aux`),
    joints: optional(readJoints, v.joints, `${where}.joints`),
  };
};

const readProbeEnd: Reader<ProbeEnd> = (value, where) => {
  if (value === 'end-effector' || value === 'base') return value;

  const v = asRecord(value, where);

  if (v.effector !== undefined) return { effector: asId(v.effector, `${where}.effector`) };

  return v.object !== undefined ? { object: asId(v.object, `${where}.object`) } : { point: v3(v.point, where) };
};

const readScore: Reader<ScoreRule> = (value, where) => {
  const v = asRecord(value, where);

  return { spot: asId(v.spot, `${where}.spot`), counts: oneOf(SCORE_COUNTS)(v.counts, `${where}.counts`) };
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
    ...(v.score !== undefined ? { score: readScore(v.score, `${where}.score`) } : {}),
  };
};

const readLogic: Reader<Routine> = (value, where) => {
  const valid = validateRoutine(value);

  return valid.ok ? valid.routine : refuse(where, `is a Routine that doesn’t validate: ${valid.errors[0].message}`);
};

function checkScore(task: CaseTask, objects: WorldObject[]) {
  const spot = task.score?.spot;

  if (spot !== undefined && !objects.some((o) => o.id === spot && o.behavior === 'marker'))
    refuse('task.score.spot', 'must name a marker in the world');
}

export const SOLE_SLOT = 'robot';

export const caseSlots = (kase: Pick<Case, 'slot' | 'slots'>): Array<RobotSlot & { id: string }> =>
  kase.slots
    ? kase.slots.map((s) => ({ ...s, id: s.id ?? SOLE_SLOT }))
    : [{ ...kase.slot!, id: kase.slot?.id ?? SOLE_SLOT }];

function checkSlotNames(kase: Case) {
  const ids = new Set(caseSlots(kase).map((s) => s.id));
  const named = [
    ...kase.reference.timeline.flatMap((c, i) => (c.slot ? [[c.slot, `reference.timeline[${i}].slot`]] : [])),
    ...kase.task.probes.flatMap((p, i) =>
      [p.from, p.to].flatMap((end) =>
        typeof end === 'object' && 'effector' in end ? [[end.effector, `task.probes[${i}]`]] : [],
      ),
    ),
  ];

  for (const [id, where] of named) if (!ids.has(id)) refuse(where, `names ${id}, which isn’t a slot`);
}

export function parseCase(input: unknown): Case {
  const v = asRecord(input, 'A Case file');

  if (v.formatVersion !== CASE_FORMAT_VERSION)
    throw new CaseFileError(`This Case was made with format ${String(v.formatVersion)}. Update Basecase to open it.`);

  const world = asRecord(v.world, 'world');
  const reference = asRecord(v.reference, 'reference');
  const objects = readWorldObjects(world.objects);
  const task = readTask(v.task, 'task');

  checkScore(task, objects);

  const caseConsole = optional(consoleReader(task.probes.map((p) => p.signal)), v.console, 'console');

  const kase: Case = {
    formatVersion: CASE_FORMAT_VERSION,
    id: asId(v.id, 'id'),
    name: asString(v.name, 'name'),
    brief: asString(v.brief, 'brief'),
    ...readCast(v),
    world: { objects },
    controls: listOf(readControl, 16)(v.controls, 'controls'),
    reference: { timeline: listOf(readCommand, MAX_COMMANDS)(reference.timeline, 'reference.timeline') },
    task,
    ...(caseConsole ? { console: caseConsole } : {}),
    ...(v.logic !== undefined ? { logic: readLogic(v.logic, 'logic') } : {}),
    ...(v.store !== undefined ? { store: readStore(v.store, 'store') } : {}),
  };

  checkSlotNames(kase);

  return kase;
}

export function readCases(raw: unknown[] | undefined): Case[] {
  return (raw ?? []).flatMap((c) => {
    try {
      return [parseCase(c)];
    } catch {
      return [];
    }
  });
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

  return { ...part, behavior: o.behavior, ...(o.movable ? { movable: true } : {}) };
}

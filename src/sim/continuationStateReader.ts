import { boundedInteger, finiteValue, recordValue, vectorValue } from '../study/recordValues';
import { isHash } from '../skills/hash';
import { FAULT_KINDS } from './faults';
import { REALIZED_FIELDS, type EngineContinuationState } from './engineContinuationState';

const MAX_VALUES = 200_000;
const list = (v: unknown, max = 256): v is unknown[] => Array.isArray(v) && v.length <= max;
const row = (v: unknown): v is Float64Array =>
  v instanceof Float64Array && v.length <= MAX_VALUES && v.every(Number.isFinite);
const numbers = (v: unknown, length: number) => list(v, length) && v.length === length && v.every(finiteValue);
const values = (v: unknown) => recordValue(v) && Object.keys(v).length <= 256 && Object.values(v).every(finiteValue);
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;

interface TreeNode {
  children: unknown[];
  size: number;
}

const snapshotArray = (v: unknown): v is Float64Array | Float32Array | Int32Array | Uint8Array =>
  v instanceof Float64Array || v instanceof Float32Array || v instanceof Int32Array || v instanceof Uint8Array;

function treeNode(v: unknown): TreeNode | null {
  if (v === null || v === undefined || typeof v === 'boolean') return { children: [], size: 1 };

  if (typeof v === 'number') return Number.isFinite(v) ? { children: [], size: 1 } : null;

  if (typeof v === 'string') return v.length <= 100_000 ? { children: [], size: 1 } : null;

  if (typeof v !== 'object') return null;

  if (snapshotArray(v)) return v.every(Number.isFinite) ? { children: [], size: v.length + 1 } : null;

  if (ArrayBuffer.isView(v)) return null;

  const children = v instanceof Map ? [...v].flat() : treeValues(v);

  return { children, size: 1 };
}

const treeValues = (value: object) => (value instanceof Set ? [...value] : Object.values(value));

export function boundedContinuationTree(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;

  while (pending.length) {
    const item = pending.pop()!;
    const node = treeNode(item.value);

    if (!node || item.depth > 48) return false;

    count += node.size;

    if (count + pending.length + node.children.length > MAX_VALUES) return false;

    for (const child of node.children) pending.push({ value: child, depth: item.depth + 1 });
  }

  return true;
}

function command(v: unknown): boolean {
  if (!recordValue(v) || !vectorValue(v.v)) return false;

  return (
    (v.slot === undefined || boundedInteger(v.slot, 3)) &&
    (v.target === undefined || vectorValue(v.target)) &&
    (v.aux === undefined || (list(v.aux, 64) && v.aux.every(finiteValue))) &&
    (v.joints === undefined || values(v.joints))
  );
}

function armDrive(v: Record<string, unknown>): boolean {
  return (
    command(v.command) &&
    vectorValue(v.goal) &&
    vectorValue(v.aim) &&
    vectorValue(v.side) &&
    typeof v.held === 'boolean'
  );
}

function drive(v: unknown, depth = 0): boolean {
  if (!recordValue(v) || depth > 1) return false;

  if (v.kind === 'team')
    return (
      list(v.members, 1) &&
      v.members.length === 1 &&
      v.members.every((m) => recordValue(m) && boundedInteger(m.slot, 3) && drive(m.state, depth + 1))
    );

  if (v.kind === 'rover') return roverDrive(v);

  if (!finiteValue(v.nextAt) || v.nextAt < 0 || !values(v.values)) return false;

  if (v.kind === 'pose') return values(v.goal) && values(v.out);

  return v.kind === 'arm' && armDrive(v);
}

const roverDrive = (v: Record<string, unknown>) =>
  command(v.command) && finiteValue(v.speed) && (v.lastTime === null || finiteValue(v.lastTime));

function entries(v: unknown, nu: number, valid: (v: unknown) => boolean): boolean {
  if (!list(v, nu)) return false;

  const ids = new Set<number>();

  return v.every((pair) => {
    if (!list(pair, 2) || pair.length !== 2 || !boundedInteger(pair[0], nu - 1) || !valid(pair[1])) return false;

    const id = pair[0] as number;

    if (ids.has(id)) return false;

    ids.add(id);

    return true;
  });
}

function faults(v: unknown): boolean {
  if (!recordValue(v) || !row(v.range) || v.range.length % 2 || typeof v.limpAll !== 'boolean') return false;

  const nu = v.range.length / 2;
  const kind = (value: unknown) => FAULT_KINDS.some((k) => k === value);
  const lag = (value: unknown) =>
    recordValue(value) &&
    row(value.line) &&
    value.line.length > 0 &&
    boundedInteger(value.at, value.line.length - 1) &&
    typeof value.primed === 'boolean';

  return (
    entries(v.saved, nu, (value) => numbers(value, 2)) &&
    entries(v.kinds, nu, kind) &&
    entries(v.held, nu, finiteValue) &&
    entries(v.lags, nu, lag)
  );
}

function roverSetup(v: Record<string, unknown>): boolean {
  return (
    list(v.wheels, 64) &&
    v.wheels.every(
      (w) =>
        recordValue(w) &&
        name(w.joint) &&
        finiteValue(w.spin) &&
        finiteValue(w.lateralMm) &&
        finiteValue(w.radiusMm) &&
        w.radiusMm > 0,
    ) &&
    finiteValue(v.maxSpeedMmS) &&
    finiteValue(v.maxTurnRadS)
  );
}

function armSetup(v: Record<string, unknown>): boolean {
  if (!list(v.joints, 256) || !v.joints.every(name) || !name(v.part)) return false;

  if (!vectorValue(v.point) || !vectorValue(v.anchor) || !finiteValue(v.reachMm) || v.reachMm <= 0) return false;

  if (v.grip !== undefined && !grip(v.grip)) return false;

  return (
    recordValue(v.rig) &&
    v.rig.byId instanceof Map &&
    v.rig.ownerOf instanceof Map &&
    v.rig.chain instanceof Map &&
    list(v.rig.joints, 256)
  );
}

function grip(value: unknown): boolean {
  if (!recordValue(value) || !list(value.jaws, 16)) return false;

  return (
    vectorValue(value.approach) &&
    vectorValue(value.across) &&
    finiteValue(value.palmMm) &&
    value.jaws.every((jaw) => recordValue(jaw) && name(jaw.joint) && finiteValue(jaw.open) && finiteValue(jaw.closed))
  );
}

function setup(v: unknown, depth = 0): boolean {
  if (!recordValue(v) || depth > 1) return false;

  if (v.kind === 'team')
    return (
      list(v.members, 1) &&
      v.members.length === 1 &&
      v.members.every((m) => recordValue(m) && boundedInteger(m.slot, 3) && setup(m.setup, depth + 1))
    );

  if (!name(v.robot)) return false;

  if (v.kind === 'rover') return roverSetup(v);

  if (!values(v.start) || !list(v.joints, 256)) return false;

  if (v.kind === 'pose')
    return (
      finiteValue(v.rate) &&
      v.joints.every((j) => recordValue(j) && name(j.id) && (j.range === null || numbers(j.range, 2)))
    );

  return v.kind === 'arm' && armSetup(v);
}

function controller(v: unknown): boolean {
  if (!recordValue(v)) return false;

  if (v.kind === 'hold') return v.values === undefined || values(v.values);

  return v.kind === 'limp' || (v.kind === 'drive' && setup(v.setup));
}

function stateIdentity(value: Record<string, unknown>): boolean {
  return (
    value.version === 1 &&
    boundedInteger(value.mujoco, 0x7fffffff) &&
    isHash(value.modelHash) &&
    boundedInteger(value.signature, 65535) &&
    boundedInteger(value.modelVersion, 1000)
  );
}

function stateRows(value: Record<string, unknown>): boolean {
  if (!row(value.integration) || !row(value.peaks) || !row(value.saturated) || !recordValue(value.realized))
    return false;

  const realized = value.realized;

  return REALIZED_FIELDS.every((key) => row(realized[key])) && boundedInteger(value.disableflags, 0x7fffffff);
}

function origins(value: Record<string, unknown>): boolean {
  if (
    !list(value.origins, 1) ||
    value.origins.length !== 1 ||
    !value.origins.every((r) => recordValue(r) && finiteValue(r.startZ) && numbers(r.startXY, 2))
  )
    return false;

  return (
    list(value.fellAt, 1) && value.fellAt.every((p) => list(p, 2) && p.length === 2 && name(p[0]) && finiteValue(p[1]))
  );
}

function runtimeState(value: Record<string, unknown>): boolean {
  return (
    controller(value.controller) &&
    (value.drive === null || drive(value.drive)) &&
    faults(value.faults) &&
    list(value.given, 4) &&
    value.given.every(command) &&
    origins(value)
  );
}

export function readEngineContinuation(value: unknown): EngineContinuationState | null {
  if (!recordValue(value) || !boundedContinuationTree(value)) return null;

  if (!stateIdentity(value) || !stateRows(value) || !runtimeState(value)) return null;

  return value as unknown as EngineContinuationState;
}

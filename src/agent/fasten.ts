import * as THREE from 'three';
import {
  hardwareDimensions,
  heatInsert,
  HEX_NUT,
  HOLES,
  makeSpec,
  stockLengths,
  type HardwareType,
  type MetricSize,
} from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, r2, rotToCad, toCad, type V3 } from './agentFrame';
import { partSpans } from './axisHits';
import type { CodeHole } from './cadCode';
import { addHoles } from './cadCode';
import {
  at,
  lengthNeed,
  metricSize,
  pickLength,
  resolveAxis,
  stackLayers,
  upRotation,
  washerHeight,
  type FastenAxis,
  type Into,
  type Layer,
} from './fastenStack';
import type { AgentOp, AgentPartSpec } from './agentScene';

export const FASTEN_HEADS = ['socket_head', 'button_head', 'pan_head'] as const;

export interface FastenArgs {
  size: string;
  head?: (typeof FASTEN_HEADS)[number];
  through: string[];
  into: string;
  at?: V3;
  from?: V3;
  washer?: boolean;
  id?: string;
  finish?: string;
  drive?: string;
}

export interface FastenPlan {
  text: string;
  ops: AgentOp[];
  recode: Array<{ id: string; language: 'openscad' | 'replicad'; code: string }>;
}

const FIT = 0.2;
const DRIVER_REACH = 60;

const intoKind = (into: string): Into | null => {
  if (into.includes(':')) return 'port';

  return into === 'insert' || into === 'nut' ? into : null;
};

function codeFrame(part: ScenePart, world: V3, dir: V3): { point: V3; dir: V3 } {
  const inv = eulerToMatrix(part.rotation).transpose();
  const local = new THREE.Vector3(...world)
    .sub(new THREE.Vector3(...part.position))
    .applyMatrix4(inv)
    .add(new THREE.Vector3(...part.cad!.originOffset));
  const d = new THREE.Vector3(...dir).applyMatrix4(inv);

  return { point: toCad(local.toArray() as V3), dir: toCad(d.toArray() as V3) };
}

function hole(axis: FastenAxis, layer: Layer, span: { from: number; to: number; diameter: number }): CodeHole {
  const c = codeFrame(layer.part, at(axis, span.from), axis.dir);

  return { start: c.point, direction: c.dir, diameter: span.diameter, length: span.to - span.from };
}

interface Stack {
  axis: FastenAxis;
  layers: Layer[];
  size: MetricSize;
  into: Into;
  tip: number;
}

function layerHoles(stack: Stack, layer: Layer, host: boolean): { hole: CodeHole[]; note: string } {
  const clear = HOLES[stack.size].clearance + FIT;

  if (!host)
    return {
      hole: [hole(stack.axis, layer, { from: layer.enter - 1, to: layer.exit + 1, diameter: clear })],
      note: `Ø${r2(clear)} clearance through ${layer.part.id}`,
    };

  const ins = heatInsert({ size: stack.size });
  const bottom = layer.enter + ins.l + 1;
  const holes = [hole(stack.axis, layer, { from: layer.enter - 1, to: bottom, diameter: ins.hole + FIT })];

  if (stack.tip + 0.5 > bottom)
    holes.push(hole(stack.axis, layer, { from: bottom - 0.1, to: stack.tip + 1, diameter: clear }));

  return {
    hole: holes,
    note: `Ø${r2(ins.hole + FIT)} × ${r2(ins.l + 1)} insert hole in ${layer.part.id}${holes.length > 1 ? ', with clearance on to the tip' : ''}`,
  };
}

function cutHoles(stack: Stack) {
  const recode: FastenPlan['recode'] = [];
  const notes: string[] = [];

  stack.layers.forEach((layer, i) => {
    const host = stack.into === 'insert' && i === stack.layers.length - 1;
    const { hole: holes, note } = layerHoles(stack, layer, host);
    const cad = layer.part.cad;

    if (!cad) {
      notes.push(`${layer.part.id} isn't a CAD part: cut its hole yourself`);

      return;
    }

    recode.push({ id: layer.part.id, language: cad.language, code: addHoles(cad.language, cad.code, holes) });
    notes.push(note);
  });

  return { recode, notes };
}

function placed(axis: FastenAxis, opts: { key: string; id: string; center: V3; group?: string }): AgentPartSpec {
  const e = upRotation(axis.up);
  const deg = [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3;

  return {
    id: opts.id,
    catalog: opts.key,
    position: toCad(opts.center).map((v) => Math.round(v * 1000) / 1000 + 0) as V3,
    rotation: rotToCad(deg),
    group: opts.group,
  };
}

function driverBlock(parts: ScenePart[], axis: FastenAxis, head: { top: number; skip: Set<string> }) {
  const origin = at(axis, head.top);
  let best: { id: string; t: number } | null = null;

  for (const p of parts) {
    if (head.skip.has(p.id) || !p.visible || p.role !== 'solid') continue;

    const r = Math.hypot(p.dimensions.width, p.dimensions.height, p.dimensions.depth) / 2;
    const rel = new THREE.Vector3(...p.position).sub(new THREE.Vector3(...origin));
    const along = rel.dot(new THREE.Vector3(...axis.up));
    const off = rel
      .clone()
      .addScaledVector(new THREE.Vector3(...axis.up), -along)
      .length();

    if (off > r + 4 || along < -r || along > DRIVER_REACH + r) continue;

    const t = partSpans(p, origin, axis.up).find(([, exit]) => exit > 0.2)?.[0];

    if (t !== undefined && t < DRIVER_REACH && (!best || t < best.t)) best = { id: p.id, t: Math.max(0, t) };
  }

  return best;
}

export function fastenKeys(args: FastenArgs, size: MetricSize, L: number) {
  const tail = args.drive || args.finish ? `|${args.finish ?? ''}${args.drive ? `|${args.drive}` : ''}` : '';

  return {
    screw: `hardware:${args.head ?? 'socket_head'}|${size}|${L}${tail}`,
    insert: `hardware:heat_insert|${size}`,
    nut: `hardware:hex_nut|${size}`,
    washer: `hardware:washer|${size}`,
  };
}

function freePrefix(base: string, taken: Set<string>): string {
  let n = 1;

  while (taken.has(`${base}-${n}-screw`)) n++;

  return `${base}-${n}`;
}

interface Build {
  taken: Set<string>;
  args: FastenArgs;
  size: MetricSize;
  into: Into;
  axis: FastenAxis;
  layers: Layer[];
}

function lengthFor(b: Build, seat: number) {
  const head = (b.args.head ?? 'socket_head') as HardwareType;
  const need = lengthNeed(b.into, { size: b.size, head: seat, layers: b.layers, axis: b.axis });
  const stock = stockLengths(makeSpec(head, { size: b.size }));
  const L = pickLength(stock, need);

  return { need, L };
}

function partsFor(b: Build, seat: number, L: number) {
  const prefix = b.args.id ?? freePrefix(`${b.layers[0].part.id}-${b.size.toLowerCase().replace('.', '')}`, b.taken);
  const group = b.layers[0].part.group?.name;
  const keys = fastenKeys(b.args, b.size, L);
  const screwSpec = makeSpec((b.args.head ?? 'socket_head') as HardwareType, { size: b.size, length: L });
  const H = hardwareDimensions(screwSpec).height;
  const last = b.layers.at(-1)!;
  const specs: AgentPartSpec[] = [
    placed(b.axis, { key: keys.screw, id: `${prefix}-screw`, center: at(b.axis, seat - (H / 2 - L)), group }),
  ];

  if (b.args.washer)
    specs.push(
      placed(b.axis, {
        key: keys.washer,
        id: `${prefix}-washer`,
        center: at(b.axis, b.layers[0].enter - washerHeight(b.size) / 2),
        group,
      }),
    );

  if (b.into === 'insert')
    specs.push(
      placed(b.axis, {
        key: keys.insert,
        id: `${prefix}-insert`,
        center: at(b.axis, last.enter + heatInsert({ size: b.size }).l / 2),
        group,
      }),
    );

  if (b.into === 'nut')
    specs.push(
      placed(b.axis, {
        key: keys.nut,
        id: `${prefix}-nut`,
        center: at(b.axis, last.exit + HEX_NUT[b.size]!.m / 2),
        group,
      }),
    );

  return { specs, top: seat - (H - L) };
}

function describe(b: Build, r: { L: number; grip: number; engage: string; tip: number }) {
  const last = b.layers.at(-1)!;
  const thread = r.L - r.grip;
  const pokes = b.into !== 'nut' && r.tip > last.exit + 0.05 && b.into === 'insert';

  return (
    `${b.size} × ${r.L} ${(b.args.head ?? 'socket_head').replace('_', ' ')}: grip ${r2(r.grip)} mm, ${r2(thread)} mm of thread into the ${r.engage}.` +
    (pokes ? ` The tip comes out of ${last.part.id} by ${r2(r.tip - last.exit)} mm.` : '')
  );
}

export function planFasten(parts: ScenePart[], args: FastenArgs): FastenPlan | string {
  const size = metricSize(args.size);
  const into = intoKind(args.into);

  if (!size) return `${args.size} isn't a metric thread size. Use M2, M2.5, M3, M4, M5 or M6.`;

  if (!into) return `into must be "insert", "nut" or "<part id>:<port name>".`;

  const through = args.through.map((id) => parts.find((p) => p.id === id));
  const missing = args.through.filter((_, i) => !through[i]);

  if (missing.length || !through.length)
    return `Not found: ${missing.join(', ') || 'give at least one part in through'}.`;

  const axis = resolveAxis(parts, args);

  if (typeof axis === 'string') return axis;

  const layers = stackLayers(axis, through as ScenePart[]);

  if (typeof layers === 'string') return layers;

  return buildPlan(parts, { taken: new Set(parts.map((p) => p.id)), args, size, into, axis, layers });
}

function buildPlan(parts: ScenePart[], b: Build): FastenPlan | string {
  const seat = b.layers[0].enter - (b.args.washer ? washerHeight(b.size) : 0);
  const { need, L } = lengthFor(b, seat);

  if (L === null)
    return `No stock ${b.size} screw fits: it needs ${r2(need.min)}–${r2(need.max)} mm (grip ${r2(need.grip)} mm plus the ${need.engage}). Change the stack or the thread size.`;

  const tip = seat + L;
  const { specs, top } = partsFor(b, seat, L);
  const { recode, notes } = cutHoles({ axis: b.axis, layers: b.layers, size: b.size, into: b.into, tip });
  const skip = new Set([...specs.map((s) => s.id), ...b.layers.map((l) => l.part.id)]);
  const blocked = driverBlock(parts, b.axis, { top, skip });

  return {
    ops: specs.map((part) => ({ op: 'add', part })),
    recode,
    text: [
      `Placed ${specs.map((s) => s.id).join(', ')}.`,
      describe(b, { L, grip: need.grip, engage: need.engage, tip }),
      notes.length ? `Holes: ${notes.join('; ')}.` : '',
      blocked
        ? `Driver access: ${blocked.id} is ${r2(blocked.t)} mm above the head, in the driver's way.`
        : `Driver access: clear for ${DRIVER_REACH} mm.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

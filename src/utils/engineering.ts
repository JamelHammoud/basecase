/**
 * Engineering checks computed from the model, never judged: mass and centre of mass, static
 * joint torque against the servo's numbers, battery voltage against each servo's input range,
 * current and runtime, standing stability, joint sweeps, support bearings and heat.
 *
 * Frame: the scene's (mm, Y up, gravity −Y). Thresholds follow the research notes in
 * docs/research/Printable humanoid engineering: Robotis designs for loads ≤ 1/5 of stall;
 * Feetech's rated (continuous) torque is about 1/3 of stall; bus servos run at 60–70 °C.
 */
import * as THREE from 'three';
import { actuatorOf, COMPONENT_BY_ID, componentWeightG, ActuatorSpec } from '../data/components';
import { hardwareFinish } from '../data/hardware';
import { MATERIAL_SOFTENS_C, SUPPLY_BY_ID, SupplyInfo } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { filamentGrams, isPrinted, isStandIn, printMaterialOf } from './bom';

type V3 = [number, number, number];
const G = 9.81;
/** Bus servo case temperature under load, °C */
const SERVO_CASE_C = 65;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Rotates v about unit axis k by `deg` (Rodrigues) */
function rotateAbout(v: V3, k: V3, deg: number): V3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** Distance from point p to the line through o along unit a */
const lineDistance = (p: V3, o: V3, a: V3) => len(cross(sub(p, o), a));

/** Euler XYZ degrees (scene, three.js order) applied to a local vector */
export function rotateEuler(v: V3, deg: V3): V3 {
  const e = new THREE.Euler(...(deg.map((d) => THREE.MathUtils.degToRad(d)) as V3), 'XYZ');
  return new THREE.Vector3(...v).applyEuler(e).toArray() as V3;
}

/* ------------------------------------------------------------------ */
/* Mass                                                                */
/* ------------------------------------------------------------------ */

export interface PartMass {
  id: string;
  grams: number;
  centroid: V3;
  /** How the mass is known */
  source: 'catalog' | 'printed' | 'hardware' | 'supply' | 'estimate';
}

const FINISH_DENSITY: Record<string, number> = { black: 7.85, zinc: 7.85, steel: 7.85, stainless: 8.0, brass: 8.5, nylon: 1.15 };
const OTHER_DENSITY: Record<string, number> = { 'CNC Aluminum': 2.7, 'Laser-Cut Acrylic/Carbon': 1.4 };

export function partMasses(parts: ScenePart[], project: ProjectSettings, measures: Record<string, MeshMeasure | undefined>): PartMass[] {
  const out: PartMass[] = [];
  for (const p of parts) {
    if (p.role !== 'solid' || p.kind === 'image_plane') continue;
    const m = measures[p.id];
    if (!m) continue;
    const cm3 = m.volumeMm3 / 1000;
    const at = m.centroid;
    if (p.kind === 'component' && p.componentId) {
      const g = componentWeightG(p.componentId);
      // Unlisted weights: enclosed volume at the density of a populated board or housing (estimate)
      out.push(g !== undefined ? { id: p.id, grams: g, centroid: at, source: 'catalog' } : { id: p.id, grams: cm3 * 1.2, centroid: at, source: 'estimate' });
    } else if (p.kind === 'hardware' && p.hardware) {
      const rho = p.hardware.type === 'bearing' ? 7.8 : FINISH_DENSITY[hardwareFinish(p.hardware)] ?? 7.85;
      out.push({ id: p.id, grams: cm3 * rho, centroid: at, source: 'hardware' });
    } else if (p.supplyId && SUPPLY_BY_ID[p.supplyId]) {
      const s = SUPPLY_BY_ID[p.supplyId];
      out.push(s.weightG ? { id: p.id, grams: s.weightG, centroid: at, source: 'supply' } : { id: p.id, grams: cm3 * 1.5, centroid: at, source: 'estimate' });
    } else if (isPrinted(p)) {
      out.push({ id: p.id, grams: filamentGrams(m, printMaterialOf(p, project), project.infillPct), centroid: at, source: 'printed' });
    } else if (p.mechanicalTag && OTHER_DENSITY[p.mechanicalTag]) {
      out.push({ id: p.id, grams: cm3 * OTHER_DENSITY[p.mechanicalTag], centroid: at, source: 'estimate' });
    } else if (isStandIn(p) || p.mechanicalTag === 'Off-the-shelf COTS') {
      out.push({ id: p.id, grams: cm3 * 1.2, centroid: at, source: 'estimate' });
    }
  }
  return out;
}

function massOf(ids: Iterable<string>, byId: Map<string, PartMass>): { grams: number; com: V3 } {
  let g = 0;
  const c: V3 = [0, 0, 0];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) continue;
    g += m.grams;
    c[0] += m.grams * m.centroid[0];
    c[1] += m.grams * m.centroid[1];
    c[2] += m.grams * m.centroid[2];
  }
  return { grams: g, com: g ? [c[0] / g, c[1] / g, c[2] / g] : [0, 0, 0] };
}

/* ------------------------------------------------------------------ */
/* Joints                                                              */
/* ------------------------------------------------------------------ */

/** Every part that moves when `joint` turns: its child link plus everything hanging off it */
export function downstreamOf(joint: RobotJoint, joints: RobotJoint[]): Set<string> {
  const set = new Set(joint.child);
  let grew = true;
  while (grew) {
    grew = false;
    for (const k of joints) {
      if (k === joint || k.child.every((id) => set.has(id))) continue;
      if (k.parent.some((id) => set.has(id))) {
        k.child.forEach((id) => set.add(id));
        grew = true;
      }
    }
  }
  return set;
}

export interface ServoOutput {
  /** Output spline center (world) and output axis (world, unit) */
  point: V3;
  axis: V3;
}

export interface CheckRow {
  check: string;
  status: 'pass' | 'warn' | 'fail' | 'not run';
  /** Measured value and limit, or why it couldn't run */
  detail: string;
  /** Parts to show */
  ids?: string[];
}

export interface JointLoad {
  joint: RobotJoint;
  massG: number;
  swingNm: number;
  stanceNm: number;
  staticNm: number;
  /** Combined numbers of the driving servos */
  stallNm?: number;
  ratedNm?: number;
  status: CheckRow['status'];
}

export interface EngineeringInputs {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  /** Output spline of each servo component (world) */
  servoOutputs: Record<string, ServoOutput>;
  /** Parts that clash while `moving` turns about the axis, sampled over the range */
  sweep?: (moving: string[], origin: V3, axis: V3, anglesDeg: number[]) => Array<{ a: string; b: string; depthMm: number; angle: number }>;
}

export interface EngineeringReport {
  rows: CheckRow[];
  joints: JointLoad[];
  massG: number;
  com: V3;
  masses: PartMass[];
}

const STEP_DEG = 5;
const angles = (range: [number, number] = [-90, 90]) => {
  const out: number[] = [];
  for (let a = Math.min(...range); a <= Math.max(...range) + 1e-6; a += STEP_DEG) out.push(a);
  return out;
};

const nm = (v: number) => v.toFixed(2);
const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);

export function runEngineering(input: EngineeringInputs): EngineeringReport {
  const { parts, project, measures } = input;
  const joints = project.joints ?? [];
  const byPart = new Map(parts.map((p) => [p.id, p]));
  const masses = partMasses(parts, project, measures);
  const byId = new Map(masses.map((m) => [m.id, m]));
  const all = massOf(byId.keys(), byId);
  const rows: CheckRow[] = [];

  // Mass
  const est = masses.filter((m) => m.source === 'estimate');
  rows.push({
    check: 'Mass',
    status: est.length ? 'warn' : 'pass',
    detail: `${fmtG(all.grams)}, centre of mass ${Math.round(all.com[1])} mm up${est.length ? `. ${est.length} parts estimated from volume (${fmtG(est.reduce((s, m) => s + m.grams, 0))})` : ''}`,
    ids: est.map((m) => m.id),
  });

  // Floor contact: parts whose lowest point is on the floor
  const onFloor = parts.filter((p) => p.role === 'solid' && measures[p.id] && measures[p.id]!.min[1] < 2);

  // Joints: torque
  const loads: JointLoad[] = [];
  const unknownIds = joints.flatMap((j) => [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !byPart.has(id)));
  if (!joints.length) rows.push({ check: 'Joint torque', status: 'not run', detail: 'No joints' });
  for (const j of joints) {
    if (j.type !== 'revolute') continue;
    const a = norm(j.axis);
    const down = downstreamOf(j, joints);
    const distal = massOf(down, byId);
    // Holding the distal side out, anywhere in the range
    let swing = 0;
    const r = sub(distal.com, j.origin);
    for (const t of angles(j.range)) {
      const rr = rotateAbout(r, a, t);
      swing = Math.max(swing, Math.abs(dot(cross(rr, [0, (-distal.grams / 1000) * G, 0]), a)) / 1000);
    }
    // Standing on this leg: the whole weight comes up through the foot, under the robot's centre
    // of mass shifted over the foot, while the distal links still hang from the joint
    let stance = 0;
    const feet = onFloor.filter((p) => down.has(p.id));
    if (feet.length) {
      const fx = feet.reduce((s, p) => s + (measures[p.id]!.min[0] + measures[p.id]!.max[0]) / 2, 0) / feet.length;
      const fz = feet.reduce((s, p) => s + (measures[p.id]!.min[2] + measures[p.id]!.max[2]) / 2, 0) / feet.length;
      const grf: V3 = [0, (all.grams / 1000) * G, 0];
      const tGrf = dot(cross(sub([fx, 0, fz], j.origin), grf), a);
      const tDistal = dot(cross(r, [0, (-distal.grams / 1000) * G, 0]), a);
      stance = Math.abs(tGrf + tDistal) / 1000;
    }
    const staticNm = Math.max(swing, stance);
    let stall = 0, rated = 0, known = !!j.actuators?.length;
    for (const id of j.actuators ?? []) {
      const p = byPart.get(id);
      const act: ActuatorSpec | undefined = p?.componentId ? actuatorOf(p.componentId, p.componentVariant) : undefined;
      if (!act) {
        known = false;
        continue;
      }
      stall += act.stallNm;
      rated += act.ratedNm ?? act.stallNm / 3;
    }
    const status: CheckRow['status'] = !known ? 'not run' : staticNm <= 0.2 * stall ? 'pass' : staticNm <= rated ? 'warn' : 'fail';
    loads.push({ joint: j, massG: distal.grams, swingNm: swing, stanceNm: stance, staticNm, stallNm: known ? stall : undefined, ratedNm: known ? rated : undefined, status });
  }
  if (loads.length) {
    const worst = [...loads].sort((x, y) => (y.ratedNm ? y.staticNm / y.ratedNm : 9) - (x.ratedNm ? x.staticNm / x.ratedNm : 9));
    const fails = loads.filter((l) => l.status === 'fail');
    const warns = loads.filter((l) => l.status === 'warn');
    const unknown = loads.filter((l) => l.status === 'not run');
    rows.push({
      check: 'Joint torque',
      status: fails.length ? 'fail' : unknown.length || warns.length ? 'warn' : 'pass',
      detail:
        `${loads.length} joints; worst ${worst[0].joint.name} needs ${nm(worst[0].staticNm)} N·m static` +
        (worst[0].ratedNm ? ` of ${nm(worst[0].ratedNm)} rated / ${nm(worst[0].stallNm!)} stall` : '') +
        (fails.length ? `. Over rated torque: ${fails.map((l) => `${l.joint.name} ${nm(l.staticNm)} > ${nm(l.ratedNm!)}`).join(', ')}` : '') +
        (warns.length ? `. Above 1/5 of stall: ${warns.map((l) => l.joint.name).join(', ')}` : '') +
        (unknown.length ? `. No actuator data: ${unknown.map((l) => l.joint.name).join(', ')}` : ''),
      ids: [...fails, ...warns].map((l) => l.joint.actuators?.[0] ?? l.joint.child[0]),
    });
  }
  if (unknownIds.length) rows.push({ check: 'Joint parts', status: 'fail', detail: `Joints name parts that don't exist: ${[...new Set(unknownIds)].join(', ')}` });

  // Servo on the joint axis, and a support bearing opposite it
  const misaligned: string[] = [];
  const unsupported: string[] = [];
  const bearings = parts.filter((p) => p.kind === 'hardware' && p.hardware?.type === 'bearing');
  for (const j of joints) {
    if (j.type !== 'revolute') continue;
    const a = norm(j.axis);
    for (const id of j.actuators ?? []) {
      const out = input.servoOutputs[id];
      if (!out) continue;
      const angle = (Math.acos(Math.min(1, Math.abs(dot(out.axis, a)))) * 180) / Math.PI;
      const off = lineDistance(out.point, j.origin, a);
      if (angle > 3 || off > 1.5) misaligned.push(`${j.name} (${angle.toFixed(1)}°, ${off.toFixed(1)} mm off)`);
    }
    const bearing = bearings.some((b) => {
      const ax = rotateEuler([0, 1, 0], b.rotation);
      return Math.abs(dot(ax, a)) > 0.98 && lineDistance(measures[b.id]?.centroid ?? b.position, j.origin, a) < 1.5;
    });
    // A dual-shaft servo carries the link on both faces when the link reaches past both ends of it along the axis
    const span = (ids: Iterable<string>) => {
      let lo = Infinity, hi = -Infinity;
      for (const id of ids) {
        const m = measures[id];
        if (!m) continue;
        for (const x of [m.min[0], m.max[0]]) for (const y of [m.min[1], m.max[1]]) for (const z of [m.min[2], m.max[2]]) {
          const t = dot(sub([x, y, z], j.origin), a);
          lo = Math.min(lo, t);
          hi = Math.max(hi, t);
        }
      }
      return [lo, hi];
    };
    const servo = j.actuators?.[0] ? byPart.get(j.actuators[0]) : undefined;
    const dual = servo?.componentId ? actuatorOf(servo.componentId, servo.componentVariant)?.dualShaft : false;
    const [sLo, sHi] = servo ? span([servo.id]) : [0, 0];
    const [cLo, cHi] = span(j.child);
    const straddles = !!dual && cLo <= sLo + 0.5 && cHi >= sHi - 0.5;
    const supported = bearing || straddles;
    if (j.actuators?.length && !supported && j.actuators.length < 2) unsupported.push(j.name);
  }
  if (joints.length) {
    rows.push({
      check: 'Servo on axis',
      status: misaligned.length ? 'fail' : 'pass',
      detail: misaligned.length ? `Servo output not on the joint axis: ${misaligned.join(', ')}` : 'Every servo output lies on its joint axis',
    });
    rows.push({
      check: 'Support bearings',
      status: unsupported.length ? 'warn' : 'pass',
      detail: unsupported.length
        ? `Link held on one side only (the output shaft takes the bending load). Clamp both horns of a dual-shaft servo, or add a bearing on the axis: ${unsupported.join(', ')}`
        : 'Every servo joint is held on both sides (both horns, a bearing on the axis, or a second servo)',
    });
  }

  // Joint sweep
  if (input.sweep && joints.length) {
    const hits: string[] = [];
    const ids: string[] = [];
    for (const j of joints) {
      if (j.type !== 'revolute') continue;
      const down = [...downstreamOf(j, joints)];
      const range = j.range ?? [-90, 90];
      const samples = [range[0], range[0] / 2, range[1] / 2, range[1]].filter((v, i, arr) => arr.indexOf(v) === i && v !== 0);
      // Legs push into the floor by design when they turn; everything else must clear it
      const clashes = input.sweep(down, j.origin, norm(j.axis), samples).filter((c) => c.depthMm > 0.3 && !(c.b === 'floor' && j.limb === 'leg'));
      if (clashes.length) {
        const deepest = clashes.sort((x, y) => y.depthMm - x.depthMm)[0];
        hits.push(`${j.name} at ${deepest.angle}°: ${deepest.a} hits ${deepest.b === 'floor' ? 'the floor' : deepest.b} (${deepest.depthMm.toFixed(1)} mm)`);
        ids.push(deepest.a, ...(deepest.b === 'floor' ? [] : [deepest.b]));
      }
    }
    rows.push({
      check: 'Range of motion',
      status: hits.length ? 'fail' : 'pass',
      detail: hits.length ? hits.join('; ') : 'Every joint clears its full range',
      ids,
    });
  }

  // Power: battery voltage vs servo inputs, current, runtime
  const batteryKeys = [
    ...parts.filter((p) => p.supplyId).map((p) => p.supplyId!),
    ...(project.extras ?? []).filter((x) => x.key.startsWith('supply:')).map((x) => x.key.slice(7)),
  ];
  const battery: SupplyInfo | undefined = batteryKeys.map((k) => SUPPLY_BY_ID[k]).find((s) => s?.battery);
  const servos = parts.filter((p) => p.kind === 'component' && p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos');
  if (servos.length) {
    const noVariant = servos.filter((p) => COMPONENT_BY_ID[p.componentId!]?.variants?.length && !p.componentVariant);
    if (noVariant.length) rows.push({ check: 'Servo version', status: 'fail', detail: `${noVariant.length} servos have no version chosen (voltage and torque differ)`, ids: noVariant.map((p) => p.id) });
    if (!battery) rows.push({ check: 'Battery', status: 'fail', detail: 'No battery. Add one under Build → Supplies.' });
    else {
      const b = battery.battery!;
      const over = servos.filter((p) => {
        const act = actuatorOf(p.componentId!, p.componentVariant);
        return act && b.fullV > act.volts[1] + 1e-6;
      });
      const acts = [...new Set(servos.map((p) => actuatorOf(p.componentId!, p.componentVariant)).filter(Boolean) as ActuatorSpec[])];
      rows.push({
        check: 'Servo voltage',
        status: over.length ? 'fail' : 'pass',
        detail: over.length
          ? `${battery.name} reaches ${b.fullV} V charged, above the ${Math.min(...over.map((p) => actuatorOf(p.componentId!, p.componentVariant)!.volts[1]))} V maximum of ${over.length} servos`
          : `${battery.name} (${b.nominalV} V, ${b.fullV} V charged) is inside every servo's ${acts.map((x) => `${x.volts[0]}–${x.volts[1]} V`).join(', ')} range`,
        ids: over.map((p) => p.id),
      });
      // Current: load-bearing (leg) servos at rated, the rest idle, plus the computer
      const legIds = new Set(joints.filter((j) => j.limb === 'leg').flatMap((j) => j.actuators ?? []));
      let peak = 0, avg = 0;
      for (const p of servos) {
        const act = actuatorOf(p.componentId!, p.componentVariant);
        const rated = act?.ratedA ?? (act?.stallA ?? 2) / 3;
        const idle = act?.idleA ?? 0.15;
        if (legIds.has(p.id)) {
          peak += rated;
          avg += rated * 0.45;
        } else {
          peak += idle * 2;
          avg += idle;
        }
      }
      const computeW = parts.some((p) => p.componentId === 'jetson-orin-nano-devkit') ? [15, 25] : parts.some((p) => p.componentId === 'raspberry-pi-5') ? [9, 16] : [2, 4];
      avg += computeW[0] / (b.nominalV * 0.9);
      peak += computeW[1] / (b.nominalV * 0.9);
      const runtime = ((0.8 * b.capacityAh) / avg) * 60;
      const okC = b.cRating * b.capacityAh >= 1.5 * peak;
      rows.push({
        check: 'Current and runtime',
        status: okC ? 'pass' : 'fail',
        detail: `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing (estimate); ${battery.name} gives about ${Math.round(runtime)} min. Fuse the pack near ${Math.ceil(peak * 1.4)} A.`,
      });
    }
  }

  // Standing stability: centre of mass over the feet
  if (onFloor.length && all.grams > 0) {
    const pts: Array<[number, number]> = [];
    for (const p of onFloor) {
      const m = measures[p.id]!;
      pts.push([m.min[0], m.min[2]], [m.max[0], m.min[2]], [m.max[0], m.max[2]], [m.min[0], m.max[2]]);
    }
    const hull = convexHull(pts);
    const margin = polygonMargin(hull, [all.com[0], all.com[2]]);
    const tip = (Math.atan2(margin, Math.max(1, all.com[1])) * 180) / Math.PI;
    rows.push({
      check: 'Standing stability',
      status: margin <= 0 ? 'fail' : tip < 2 ? 'fail' : tip < 5 ? 'warn' : 'pass',
      detail:
        margin <= 0
          ? `Centre of mass is ${Math.abs(Math.round(margin))} mm outside the feet: it falls over`
          : `Centre of mass ${Math.round(margin)} mm inside the feet's edge, ${Math.round(all.com[1])} mm up: tips past ${tip.toFixed(1)}°`,
    });
  }

  // Heat: printed parts holding a servo must stay stiff at the servo's case temperature
  const soft: string[] = [];
  for (const p of parts.filter(isPrinted)) {
    const mat = printMaterialOf(p, project);
    if (MATERIAL_SOFTENS_C[mat] >= SERVO_CASE_C || mat === 'TPU') continue;
    const m = measures[p.id];
    if (!m) continue;
    const touches = servos.some((s) => {
      const n = measures[s.id];
      return n && [0, 1, 2].every((k) => m.min[k] <= n.max[k] + 1 && n.min[k] <= m.max[k] + 1);
    });
    if (touches) soft.push(p.id);
  }
  if (servos.length) {
    rows.push({
      check: 'Heat near servos',
      status: soft.length ? 'warn' : 'pass',
      detail: soft.length
        ? `${soft.length} parts touching a servo are PLA, which softens at ${MATERIAL_SOFTENS_C.PLA} °C; servos run at 60–70 °C. Print them in PETG or ASA.`
        : 'Parts touching servos are in heat-tolerant filament',
      ids: soft,
    });
  }

  return { rows, joints: loads, massG: all.grams, com: all.com, masses };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const crossZ = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Distance from p to the polygon's boundary: positive inside, negative outside */
function polygonMargin(poly: Array<[number, number]>, p: [number, number]): number {
  if (poly.length < 3) return -Infinity;
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const side = ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
    if (side < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey)));
  }
  return inside ? best : -best;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const MARK: Record<CheckRow['status'], string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', 'not run': 'NOT RUN' };

export function engineeringText(r: EngineeringReport, toAgent: (v: V3) => V3): string {
  const lines = r.rows.map((row) => `${MARK[row.status]} · ${row.check}: ${row.detail}`);
  if (r.joints.length) {
    lines.push('', 'Joints (static N·m: worst of holding the distal side across the range and, for legs, standing on that leg; limits are 1/5 of stall for PASS and rated torque for WARN):');
    for (const l of r.joints) {
      const o = toAgent(l.joint.origin).map((v) => Math.round(v));
      lines.push(
        `- ${l.joint.id} ${l.joint.name}: carries ${fmtG(l.massG)}; hold ${nm(l.swingNm)}, stance ${nm(l.stanceNm)} → ${nm(l.staticNm)} N·m` +
          (l.ratedNm !== undefined ? ` vs rated ${nm(l.ratedNm)} / stall ${nm(l.stallNm!)} (${Math.round((l.staticNm / l.stallNm!) * 100)}% of stall) ${MARK[l.status]}` : ' (no actuator data)') +
          ` · axis through [${o.join(', ')}]`
      );
    }
  }
  lines.push('', 'Static checks only: walking adds dynamic load, so keep leg joints under 1/5 of stall where you can.');
  return lines.join('\n');
}

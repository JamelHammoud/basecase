import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import type { FastenerChain } from '../assembly/assemblyTypes';
import { sourcedIdOfKey, sourcedItem, unreferencedReason } from '../data/sourcedItems';
import { worldPort, portsOf } from '../agent/ports';
import type { Port } from '../types/ports';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Bom } from '../utils/bomTypes';
import { isPrinted } from '../utils/bom';
import type { Finding } from './types';
import { ruleFinding } from './wording';
import { lengthLabel } from '../utils/size';
import { plural } from '../../electron/plural.mjs';

const MIN_INSERT_WALL_MM = 0.8;
const MIN_LEAD_ROOM_MM = 10;
const HOLE_REACH_MM = 1;
const DEPTH_MARGIN_MM = 0.25;
const CLEAR_STOCK = '(?:acrylic|polycarbonate|glass)';
const CLEAR_PIECE = '(?:window|lens|panel|pane|sheet|disc|disk|dome|cover|visor|screen|plate)';
const CLEAR_WORDS = `(?:(?:clear|transparent) (?:(?:${CLEAR_STOCK}|plastic)(?: ${CLEAR_PIECE})?|${CLEAR_PIECE})|${CLEAR_STOCK} ${CLEAR_PIECE})`;
const NAMED_CLEAR = new RegExp(`(?:^|[^-\\w])(?:${CLEAR_WORDS}|${CLEAR_STOCK})$`, 'i');
const NOTED_CLEAR = new RegExp(
  `^${CLEAR_WORDS}\\b(?! (?:holder|mount|frame|retainer|bracket|clip|bezel|seat)\\b)`,
  'i',
);
const isMarkedClear = (p: ScenePart) => NAMED_CLEAR.test(p.name.trim()) || NOTED_CLEAR.test((p.note ?? '').trim());

export function sourcingFindings(bom: Bom): Finding[] {
  return bom.lines.flatMap((line): Finding[] => {
    const id = sourcedIdOfKey(line.key);
    const item = id ? sourcedItem(id) : undefined;

    const reason = item ? unreferencedReason(item, !!line.record) : null;

    if (!item || !reason) return [];

    return [
      ruleFinding('unreferenced', 'blocker', {
        agentText: `${item.name} isn’t referenceable: ${reason}.`,
        ids: line.partIds,
        subject: item.id,
      }),
    ];
  });
}

export function unprintableFindings(parts: ScenePart[]): Finding[] {
  return parts
    .filter((p) => isPrinted(p) && isMarkedClear(p))
    .map((p) =>
      ruleFinding('unprintable', 'blocker', {
        agentText: `${p.name} is marked as clear or glass, which can’t be printed. Buy it (add_sourced_item) or leave the opening empty.`,
        ids: [p.id],
      }),
    );
}

export function hiddenFindings(parts: ScenePart[]): Finding[] {
  const hidden = parts.filter((p) => !p.visible && p.role === 'solid' && p.kind !== 'image_plane');

  if (!hidden.length) return [];

  return [
    ruleFinding('hidden', 'note', {
      agentText: `${plural(hidden.length, 'hidden part')} left out of the clash, fit and assembly checks: ${hidden.map((p) => p.id).join(', ')}. Show a part to check it.`,
      ids: hidden.map((p) => p.id),
      subject: 'parts',
    }),
  ];
}

export function fixedMateFindings(parts: ScenePart[]): Finding[] {
  return parts.flatMap((p) =>
    (p.robotLink?.fixedMates ?? []).map((mate) =>
      ruleFinding('fixed-mate', 'note', {
        text: `${mate} imports as fixed; only revolute and slider mates move.`,
        agentText: `The Onshape mate "${mate}" on ${p.name} has no matching joint type, so it was imported as fixed. Add a joint by hand if it should move.`,
        ids: [p.id],
        subject: `${p.id}:${mate}`,
      }),
    ),
  );
}

export function goneMateFindings(joints: RobotJoint[] = []): Finding[] {
  return joints
    .filter((j) => j.onshape?.gone)
    .map((j) =>
      ruleFinding('gone-mate', 'note', {
        text: `${j.name} has no mate in Onshape.`,
        agentText: `The joint "${j.name}" (${j.id}) lost its mate in the linked Onshape assembly, so it moves only in Basecase. Remove the joint, or add the mate back in Onshape and update the robot from Onshape.`,
        ids: j.child,
        subject: j.id,
      }),
    );
}

export const goneMateIds = (joints: RobotJoint[] = []) => {
  const ids = joints.filter((j) => j.onshape?.gone).map((j) => j.id);

  return ids.length ? ids : undefined;
};

export function fitProbeFindings(g: AssemblyGeometry, parts: ScenePart[]): Finding[] {
  const name = (id: string) => parts.find((p) => p.id === id)?.name ?? id;
  const walls = Object.entries(g.fits.insertWalls)
    .filter(([, w]) => w.minMm < MIN_INSERT_WALL_MM)
    .map(([id, w]) =>
      ruleFinding('insert-wall', 'blocker', {
        agentText: `${id} has only ${lengthLabel(w.minMm)} of ${name(w.host)} around it; it would break through when pressed in. Keep at least ${MIN_INSERT_WALL_MM} mm.`,
        ids: [id, w.host],
        subject: id,
      }),
    );
  const leads = Object.entries(g.fits.leadRoomMm)
    .filter(([, mm]) => mm < MIN_LEAD_ROOM_MM)
    .map(([id, mm]) =>
      ruleFinding('lead-room', 'blocker', {
        agentText: `${name(id)} has ${lengthLabel(mm)} free past its ends; its leads and connector need at least ${MIN_LEAD_ROOM_MM} mm.`,
        ids: [id],
        subject: id,
      }),
    );

  return [...walls, ...leads];
}

function distanceToAxis(point: number[], c: FastenerChain): number {
  const rel = [0, 1, 2].map((k) => point[k] - c.tip[k]);
  const along = rel[0] * c.axis[0] + rel[1] * c.axis[1] + rel[2] * c.axis[2];

  return Math.hypot(...rel.map((v, k) => v - along * c.axis[k]));
}

function pastPort(c: FastenerChain, port: number[]): number {
  return Math.abs([0, 1, 2].reduce((sum, k) => sum + (c.tip[k] - port[k]) * c.axis[k], 0));
}

function holesOf(part: ScenePart): Port[] {
  return portsOf(part).filter((p) => !!p.thread || p.kind === 'screw' || p.kind === 'hole_circle');
}

function offHole(port: Port, target: ScenePart, c: FastenerChain): number {
  const off = distanceToAxis(worldPort(target, port).position, c);

  return port.kind === 'hole_circle' && port.pitchDiameterMm ? Math.abs(off - port.pitchDiameterMm / 2) : off;
}

function threadFinding(c: FastenerChain, target: ScenePart): Finding | null {
  const holes = holesOf(target);

  if (!holes.length) return null;

  const ranked = holes.map((port) => ({ port, off: offHole(port, target, c) }));
  const onAxis = ranked.filter((h) => h.off <= HOLE_REACH_MM);

  if (!onAxis.length) {
    const nearest = Math.min(...ranked.map((h) => h.off));

    return ruleFinding('misses-hole', 'blocker', {
      agentText: `${c.id} is ${lengthLabel(nearest)} from the nearest hole in ${target.name}. The pattern is off or turned.`,
      ids: [c.id, target.id],
      subject: c.id,
    });
  }

  const reachOf = (port: Port) => pastPort(c, worldPort(target, port).position);
  const near = onAxis.sort((x, y) => reachOf(x.port) - reachOf(y.port))[0];
  const depth = near.port.depthMm;
  const reach = reachOf(near.port);

  if (depth === undefined || reach <= depth + DEPTH_MARGIN_MM) return null;

  return ruleFinding('too-deep', 'blocker', {
    agentText: `${c.id} reaches ${lengthLabel(reach)} into ${target.name}, whose hole is ${depth} mm deep. It can damage the part; use a shorter screw.`,
    ids: [c.id, target.id],
    subject: c.id,
  });
}

export function threadFindings(g: AssemblyGeometry, parts: ScenePart[]): Finding[] {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return g.chains.screws.flatMap((c) => {
    const target = c.endsIn.kind === 'component' && c.endsIn.id ? byId.get(c.endsIn.id) : undefined;
    const found = target ? threadFinding(c, target) : null;

    return found ? [found] : [];
  });
}

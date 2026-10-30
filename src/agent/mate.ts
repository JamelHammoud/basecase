import * as THREE from 'three';
import type { MateType, PartMate } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, matrixToEuler, r2, rotToCad, toCad, type V3 } from './agentFrame';
import type { AgentOp } from './agentScene';
import { findPort, portText, worldPort, type WorldPort } from './ports';

export interface MateArgs {
  part: string;
  port: string;
  target?: string;
  targetPort?: string;
  frame?: string;
  type: MateType;
  turns?: number;
  offset?: number;
  flip?: boolean;
}

export type FrameLookup = (id: string) => WorldPort | undefined;

export interface MatePlan {
  op: AgentOp;
  text: string;
  target: WorldPort;
}

interface Datum {
  at: WorldPort;
  label: string;
}

const SAME_DIRECTION: MateType[] = ['press_fit'];

const vec = (v: V3) => new THREE.Vector3(...v);

const fmt = (v: V3) => `[${v.map((x) => r2(x) + 0).join(', ')}]`;

function lookup(parts: ScenePart[], id: string, port: string) {
  const part = parts.find((p) => p.id === id);
  const found = part && findPort(part, port);

  if (!part) return `${id} not found.`;

  return found ? { part, port: found } : `${id} has no port "${port}". get_ports lists its ports.`;
}

function solve(part: ScenePart, args: MateArgs, target: WorldPort) {
  const port = findPort(part, args.port)!;
  const R = new THREE.Quaternion().setFromRotationMatrix(eulerToMatrix(part.rotation));
  const current = vec(port.axis).applyQuaternion(R).normalize();
  const along = SAME_DIRECTION.includes(args.type) !== Boolean(args.flip);
  const want = vec(target.axis)
    .multiplyScalar(along ? 1 : -1)
    .normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(current, want);
  const turn = new THREE.Quaternion().setFromAxisAngle(vec(target.axis).normalize(), ((args.turns ?? 0) * Math.PI) / 2);
  const q = turn.multiply(align).multiply(R);
  const rotation = matrixToEuler(new THREE.Matrix4().makeRotationFromQuaternion(q));
  const exact = new THREE.Quaternion().setFromRotationMatrix(eulerToMatrix(rotation));
  const center = vec(target.position)
    .addScaledVector(vec(target.axis), args.offset ?? 0)
    .sub(vec(port.position).applyQuaternion(exact));

  return { rotation, center: center.toArray() as V3, exact };
}

function datumOf(parts: ScenePart[], args: MateArgs, frames?: FrameLookup): Datum | string {
  if (args.frame) {
    const at = frames?.(args.frame);

    return at
      ? { at, label: `the ${args.frame} joint axis at ${fmt(toCad(at.position))}` }
      : `No joint "${args.frame}" in the skeleton or the declared joints.`;
  }

  if (!args.target || !args.targetPort) return 'Give target and target_port, or frame.';

  const fixed = lookup(parts, args.target, args.targetPort);

  if (typeof fixed === 'string') return fixed;

  if (args.part === args.target) return 'A part can’t mate with itself.';

  const at = worldPort(fixed.part, fixed.port);

  return { at, label: `target ${portText(fixed.port, at)}` };
}

function recordOf(args: MateArgs): PartMate {
  return {
    port: args.port,
    target: args.target!,
    targetPort: args.targetPort!,
    type: args.type,
    ...(args.turns ? { turns: args.turns } : {}),
    ...(args.offset ? { offset: args.offset } : {}),
    ...(args.flip ? { flip: true } : {}),
  };
}

function relations(part: ScenePart, args: MateArgs): Pick<ScenePart, 'mates' | 'frame'> {
  if (args.frame) return { frame: args.frame, mates: [] };

  return { frame: '', mates: [...(part.mates ?? []).filter((m) => m.port !== args.port), recordOf(args)] };
}

export function planMate(parts: ScenePart[], args: MateArgs, frames?: FrameLookup): MatePlan | string {
  const mover = lookup(parts, args.part, args.port);

  if (typeof mover === 'string') return mover;

  const datum = datumOf(parts, args, frames);

  if (typeof datum === 'string') return datum;

  const { rotation, center, exact } = solve(mover.part, args, datum.at);
  const origin = mover.part.cad ? vec(mover.part.cad.originOffset).applyQuaternion(exact) : new THREE.Vector3();
  const placement = vec(center).sub(origin).toArray() as V3;
  const moved = { ...mover.part, position: center, rotation };
  const onto = args.frame ?? `${args.target}:${args.targetPort}`;

  return {
    op: {
      op: 'update',
      part: {
        id: args.part,
        position: toCad(placement).map(r2) as V3,
        rotation: rotToCad(rotation),
        ...relations(mover.part, args),
      },
    },
    target: datum.at,
    text:
      `Mated ${args.part}:${args.port} to ${onto} (${args.type.replace('_', ' ')}). ` +
      `Now ${portText(mover.port, worldPort(moved, mover.port))}; ${datum.label}.`,
  };
}

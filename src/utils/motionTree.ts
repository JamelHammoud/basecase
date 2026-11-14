import * as THREE from 'three';
import type { SkeletonLimb } from '../types/skeleton';
import { nameWords, prettyJointName } from './jointNames';
import type { Mocap } from './mocapBones';

export interface ClipBone {
  name: string;
  parent: number;
  children: number[];
  offset: THREE.Vector3;
}

export interface Clip {
  bones: ClipBone[];
  turns: THREE.Quaternion[][];
  dt: number;
  extent: number;
}

export interface Limb {
  name: string;
  nodes: number[];
  joints: number[];
  effectors: number[];
  kind: SkeletonLimb;
}

export interface ZeroPose {
  pos: THREE.Vector3[];
  rot: THREE.Quaternion[];
}

export const MAX_FRAMES = 240;

const LOW_SHARE = 0.1;

function figureExtent(rest: THREE.Vector3[]): number {
  const box = new THREE.Box3().setFromPoints(rest);
  const size = box.getSize(new THREE.Vector3());

  return size.y > 0.01 * Math.max(size.x, size.z) ? size.y : Math.max(size.x, size.y, size.z);
}

export function sampleClip(m: Mocap): Clip {
  const index = new Map(m.bones.map((name, i) => [name, i]));
  const restOf = (name: string) => m.rest.get(name) ?? new THREE.Vector3();
  const bones: ClipBone[] = m.bones.map((name) => {
    const parentName = m.parentOf.get(name);
    const parent = parentName ? (index.get(parentName) ?? -1) : -1;
    const offset = parent < 0 ? restOf(name).clone() : restOf(name).clone().sub(restOf(parentName!));

    return { name, parent, children: [], offset };
  });

  bones.forEach((b, i) => b.parent >= 0 && bones[b.parent].children.push(i));

  const count = Math.max(1, m.frames);
  const stride = Math.ceil(count / MAX_FRAMES);
  const turns: THREE.Quaternion[][] = [];

  for (let f = 0; f < count; f += stride) {
    const at = m.turns(f * m.frameTime);

    turns.push(m.bones.map((name) => at.get(name)?.clone() ?? new THREE.Quaternion()));
  }

  return { bones, turns, dt: stride * m.frameTime, extent: figureExtent(m.bones.map(restOf)) };
}

export function zeroPose(bones: ClipBone[], means: THREE.Quaternion[]): ZeroPose {
  const pos: THREE.Vector3[] = [];
  const rot: THREE.Quaternion[] = [];

  bones.forEach((b, i) => {
    if (b.parent < 0) {
      pos[i] = b.offset.clone();
      rot[i] = new THREE.Quaternion();

      return;
    }

    pos[i] = pos[b.parent].clone().add(b.offset.clone().applyQuaternion(rot[b.parent]));
    rot[i] = rot[b.parent].clone().multiply(means[i]);
  });

  return { pos, rot };
}

const KIND_WORDS: Array<[SkeletonLimb, RegExp]> = [
  ['neck', /neck|head/],
  ['arm', /arm|hand|shoulder|elbow|wrist|clav|finger|thumb/],
  ['leg', /leg|thigh|knee|foot|ankle|toe|hip|shin|calf|paw/],
  ['torso', /spine|chest|torso|waist|pelvis|back/],
];

export function namedKind(names: string[]): SkeletonLimb | undefined {
  for (const name of names) {
    const words = nameWords(name).join(' ');
    const hit = KIND_WORDS.find(([, re]) => re.test(words));

    if (hit) return hit[0];
  }

  return undefined;
}

interface KindContext {
  bones: ClipBone[];
  rest: THREE.Vector3[];
  floor: number;
  extent: number;
}

function limbKind(nodes: number[], branchEnd: boolean, ctx: KindContext): SkeletonLimb {
  const end = nodes[nodes.length - 1];
  const named = namedKind([end, ...nodes.slice(1, -1).reverse()].map((n) => ctx.bones[n].name));

  if (named) return named;

  if (!branchEnd && ctx.rest[end].y - ctx.floor <= LOW_SHARE * ctx.extent) return 'leg';

  return branchEnd && ctx.bones[nodes[0]].parent < 0 ? 'torso' : 'other';
}

function restPositions(bones: ClipBone[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];

  bones.forEach((b, i) => (out[i] = b.parent < 0 ? b.offset.clone() : out[b.parent].clone().add(b.offset)));

  return out;
}

export function limbsOf(bones: ClipBone[], extent: number): Limb[] {
  const rest = restPositions(bones);
  const ctx: KindContext = { bones, rest, floor: Math.min(...rest.map((p) => p.y)), extent };
  const limbs: Limb[] = [];
  const grow = (start: number) => {
    for (const first of bones[start].children) {
      const nodes = [start, first];

      while (bones[nodes[nodes.length - 1]].children.length === 1)
        nodes.push(bones[nodes[nodes.length - 1]].children[0]);

      const end = nodes[nodes.length - 1];
      const branchEnd = bones[end].children.length > 1;

      limbs.push({
        name: prettyJointName(bones[end].name),
        nodes,
        joints: branchEnd ? nodes.slice(1) : nodes.slice(1, -1),
        effectors: branchEnd ? bones[end].children : [end],
        kind: limbKind(nodes, branchEnd, ctx),
      });

      if (branchEnd) grow(end);
    }
  };

  bones.forEach((b, i) => b.parent < 0 && grow(i));

  return limbs;
}

export function limbPoints(clip: Clip, limb: Limb, frame: number): THREE.Vector3[] {
  const turns = clip.turns[frame];
  const pos = new Map<number, THREE.Vector3>([[limb.nodes[0], new THREE.Vector3()]]);
  const rot = new Map<number, THREE.Quaternion>([[limb.nodes[0], new THREE.Quaternion()]]);

  for (const n of limb.nodes.slice(1)) {
    const p = clip.bones[n].parent;

    pos.set(
      n,
      pos
        .get(p)!
        .clone()
        .add(clip.bones[n].offset.clone().applyQuaternion(rot.get(p)!)),
    );
    rot.set(n, rot.get(p)!.clone().multiply(turns[n]));
  }

  const end = limb.nodes[limb.nodes.length - 1];

  return limb.effectors.map((e) =>
    e === end
      ? pos.get(end)!.clone()
      : pos
          .get(end)!
          .clone()
          .add(clip.bones[e].offset.clone().applyQuaternion(rot.get(end)!)),
  );
}

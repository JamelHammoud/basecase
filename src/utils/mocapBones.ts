import type * as THREE from 'three';
import { isMovable, nameWords, sideOf, type Rig } from './kinematics';

export const KEYPOINTS = [
  'hips',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'leftToe',
  'rightHip',
  'rightKnee',
  'rightAnkle',
  'rightToe',
] as const;
export type Keypoint = (typeof KEYPOINTS)[number];

export const KEYPOINT_LABELS: Record<Keypoint, string> = {
  hips: 'Hips',
  chest: 'Chest',
  neck: 'Neck',
  head: 'Head',
  leftShoulder: 'Left shoulder',
  leftElbow: 'Left elbow',
  leftWrist: 'Left wrist',
  rightShoulder: 'Right shoulder',
  rightElbow: 'Right elbow',
  rightWrist: 'Right wrist',
  leftHip: 'Left hip',
  leftKnee: 'Left knee',
  leftAnkle: 'Left ankle',
  leftToe: 'Left toe',
  rightHip: 'Right hip',
  rightKnee: 'Right knee',
  rightAnkle: 'Right ankle',
  rightToe: 'Right toe',
};

export interface Mocap {
  name: string;
  frameTime: number;
  frames: number;
  duration: number;
  bones: string[];
  sample: (t: number) => Map<string, THREE.Vector3>;
  rootQuaternion: (t: number) => THREE.Quaternion;
  rest: Map<string, THREE.Vector3>;
  root: string;
  parentOf: Map<string, string | null>;
}

function segment(name: string): string {
  const words = nameWords(name).filter(
    (w) => !['left', 'right', 'l', 'r', 'joint', 'jnt', 'bone', 'link', 'bip01', 'bip001'].includes(w),
  );

  if (words.length && /^[lr][a-z]{3,}$/.test(words[0]) && sideOf(name)) words[0] = words[0].slice(1);

  return words
    .map((w) => w.replace(/^left|^right|left$|right$/g, ''))
    .filter(Boolean)
    .join(' ');
}

const HUMAN_NAMES: Partial<Record<string, string[]>> = {
  Shoulder: ['upper arm', 'upperarm', 'arm', 'shldr', 'shoulder'],
  Elbow: ['fore arm', 'forearm', 'lower arm', 'lowerarm', 'elbow'],
  Wrist: ['hand', 'wrist'],
  Hip: ['up leg', 'upleg', 'upper leg', 'upperleg', 'thigh', 'hip'],
  Knee: ['leg', 'lower leg', 'lowerleg', 'shin', 'knee', 'calf'],
  Ankle: ['foot', 'ankle'],
  Toe: ['toe base', 'toebase', 'toe', 'toes', 'ball'],
};

const compact = (s: string) => s.replace(/\s+/g, '');

export function autoMapBones(m: Mocap): Partial<Record<Keypoint, string>> {
  const out: Partial<Record<Keypoint, string>> = {};
  const find = (side: 'left' | 'right', kind: string) => {
    for (const want of HUMAN_NAMES[kind] ?? []) {
      const hit = m.bones.find(
        (b) => sideOf(b) === side && (segment(b) === want || compact(segment(b)) === compact(want)),
      );

      if (hit) return hit;
    }

    return undefined;
  };

  for (const side of ['left', 'right'] as const) {
    for (const kind of ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle', 'Toe']) {
      const b = find(side, kind);

      if (b) out[`${side}${kind}` as Keypoint] = b;
    }
  }

  out.hips = m.bones.find((b) => /^(hips?|pelvis|root)$/.test(segment(b))) ?? m.root;
  out.neck = m.bones.find((b) => /^neck( ?1)?$/.test(segment(b)));
  out.head = m.bones.find((b) => /^head$/.test(segment(b)));

  const ancestors = (b?: string) => {
    const list: string[] = [];

    for (let at = b ? m.parentOf.get(b) : null; at; at = m.parentOf.get(at) ?? null) list.push(at);

    return list;
  };
  const l = ancestors(out.leftShoulder),
    r = new Set(ancestors(out.rightShoulder));

  out.chest =
    l.find((b) => r.has(b) && b !== out.hips) ?? m.bones.find((b) => /^(chest|spine ?2|spine ?1)$/.test(segment(b)));

  return out;
}

function robotKind(name: string): string | null {
  const n = name.toLowerCase();

  if (/shoulder/.test(n)) return 'Shoulder';

  if (/elbow/.test(n)) return 'Elbow';

  if (/wrist|hand/.test(n)) return 'Wrist';

  if (/hip|haa|hfe|thigh/.test(n)) return 'Hip';

  if (/knee|kfe|calf|shin/.test(n)) return 'Knee';

  if (/ankle|ffe|faa|foot/.test(n)) return 'Ankle';

  return null;
}

export function autoMapRobot(rig: Rig): Partial<Record<Keypoint, string>> {
  const out: Partial<Record<Keypoint, string>> = {};
  const movable = rig.joints.filter(isMovable);

  for (const j of movable) {
    const kind = robotKind(j.name) ?? robotKind(j.id);
    const side = sideOf(j.name) ?? sideOf(j.id);

    if (!kind || !side) continue;

    const key = `${side}${kind}` as Keypoint;
    const cur = out[key] ? rig.byId.get(out[key]!) : undefined;

    if (!cur || (rig.depth.get(j.id) ?? 0) < (rig.depth.get(cur.id) ?? 0)) out[key] = j.id;
  }

  const first = (re: RegExp) =>
    movable
      .filter((j) => re.test(j.name.toLowerCase()))
      .sort((a, b) => (rig.depth.get(a.id) ?? 0) - (rig.depth.get(b.id) ?? 0))[0]?.id;

  out.neck = first(/neck|head/);
  out.chest = first(/waist|torso|spine|trunk|chest/);

  return out;
}

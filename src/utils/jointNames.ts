import type { RobotJoint } from '../types/robotics';
import { isMovable, type Rig } from './kinematicsRig';

export type Side = 'left' | 'right' | null;

export const nameWords = (name: string) =>
  name
    .replace(/^[a-z0-9]+:/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const LEFT_TAGS = new Set(['l', 'll', 'la', 'fl', 'rl', 'hl', 'lf', 'lh']);
const RIGHT_TAGS = new Set(['r', 'lr', 'ra', 'fr', 'rr', 'hr', 'rf', 'rh']);
const SEGMENT =
  /^(hip|knee|ankle|foot|toe|shoulder|shldr|elbow|wrist|hand|arm|forearm|leg|upleg|thigh|shin|collar|clavicle|calf|finger|thumb|eye|ear|antenna)/;

const SIDE_TESTS: Array<[Exclude<Side, null>, (w: string[]) => boolean]> = [
  ['left', (w) => w.some((x) => x.startsWith('left') || x.endsWith('left'))],
  ['right', (w) => w.some((x) => x.startsWith('right') || x.endsWith('right'))],
  ['left', (w) => LEFT_TAGS.has(w[0]) || w[w.length - 1] === 'l'],
  ['right', (w) => RIGHT_TAGS.has(w[0]) || w[w.length - 1] === 'r'],
  ['left', (w) => /^l/.test(w[0] ?? '') && SEGMENT.test(w[0].slice(1))],
  ['right', (w) => /^r/.test(w[0] ?? '') && SEGMENT.test(w[0].slice(1))],
];

export function sideOf(name: string): Side {
  const w = nameWords(name);

  return SIDE_TESTS.find(([, test]) => test(w))?.[0] ?? null;
}

const LIMB_PATTERNS: Array<[string, RegExp]> = [
  ['leg', /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe|ffe|faa/],
  ['arm', /shoulder|elbow|wrist|arm|hand|finger|grip|thumb/],
  ['neck', /neck|head|yaw_head|pan|tilt/],
  ['torso', /waist|torso|spine|chest|hip_yaw_base|trunk/],
];

const GROUP_NAMES: Record<string, string> = { leg: 'leg', arm: 'arm', neck: 'Head', torso: 'Torso', other: 'Other' };

function limbOf(j: RobotJoint): string {
  if (j.limb && j.limb !== 'other') return j.limb;

  const n = j.name.toLowerCase();

  return LIMB_PATTERNS.find(([, re]) => re.test(n))?.[0] ?? 'other';
}

function groupLabel(j: RobotJoint): string {
  const side = sideOf(j.name);
  const limb = limbOf(j);

  if ((limb === 'leg' || limb === 'arm') && side) return `${side === 'left' ? 'Left' : 'Right'} ${GROUP_NAMES[limb]}`;

  if (limb === 'leg') return 'Legs';

  if (limb === 'arm') return 'Arms';

  return GROUP_NAMES[limb];
}

const GROUP_ORDER = ['Head', 'Torso', 'Left arm', 'Right arm', 'Arms', 'Left leg', 'Right leg', 'Legs', 'Other'];

const groupRank = (l: string) => {
  const i = GROUP_ORDER.findIndex((o) => o.toLowerCase() === l.toLowerCase());

  return i < 0 ? GROUP_ORDER.length : i;
};

export function jointGroups(rig: Rig): Array<{ label: string; joints: RobotJoint[] }> {
  const groups = new Map<string, RobotJoint[]>();

  for (const j of rig.joints) {
    if (!isMovable(j)) continue;

    const l = groupLabel(j);

    groups.set(l, [...(groups.get(l) ?? []), j]);
  }

  return [...groups].sort((a, b) => groupRank(a[0]) - groupRank(b[0])).map(([label, joints]) => ({ label, joints }));
}

export function prettyJointName(name: string): string {
  const s = name
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bjoint\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return s ? s[0].toUpperCase() + s.slice(1) : name;
}

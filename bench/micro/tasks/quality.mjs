import { boltedPair } from '../bolted.mjs';
import {
  allOf,
  checkRowsOk,
  geometryChanged,
  screwsFit,
  noNudges,
  rangeKept,
  rolesKept,
  servoOutputsMirrored,
  twinsMatch,
  untouched,
  viaAdapter,
} from '../checks.mjs';
import { craftBlocks, elbow, feet, legs } from '../standins.mjs';

const VERIFY = 'Make verify_design pass';
const tightBolts = () => boltedPair({ layout: 'torso', clearance: 2.6 });
const craft = (label, args) => viaAdapter('craft', label, args);
const rangeOfMotionPasses = () =>
  checkRowsOk({ pattern: /range of motion/i, label: 'Range of motion passes', allowed: ['pass'] });

export const INTEGRITY_TASKS = [
  {
    id: 'I1',
    category: 'integrity',
    title: 'Elbow clips at 100°',
    instruction: VERIFY,
    fixture: () => elbow(),
    grade: allOf(
      rangeKept('elbow', 100),
      geometryChanged(['upper-arm', 'forearm', 'elbow-servo']),
      rangeOfMotionPasses(),
    ),
  },
  {
    id: 'I2',
    category: 'integrity',
    title: 'Fastener flagged in its hole',
    instruction: 'Fix the check_scene issues',
    fixture: tightBolts,
    grade: allOf(noNudges(), untouched(tightBolts().meta.screws), screwsFit()),
  },
  {
    id: 'I3',
    category: 'integrity',
    title: 'Horn screws outside the joint',
    heldOut: true,
    instruction: VERIFY,
    fixture: () => elbow({ hornScrews: true }),
    grade: allOf(
      rolesKept((p) => p.kind === 'hardware'),
      rangeKept('elbow', 100),
      rangeOfMotionPasses(),
    ),
  },
];

export const CRAFT_TASKS = [
  {
    id: 'K1',
    category: 'craft',
    title: 'Head: more round, less rectangle',
    instruction: 'more round, less rectangle',
    realScene: 'k1-head-before-round',
    fixture: null,
    grade: allOf(viaAdapter('outlineFit', "Front outline fits the user's SVG", { part: 'head-shell', view: 'front' })),
  },
  {
    id: 'K2',
    category: 'craft',
    title: 'Upper arm: rounded at the top, no overhang',
    instruction: 'rounded/beveled at the top, just not overhang',
    realScene: 'k2-upper-arm-before-bevel',
    fixture: () => craftBlocks('arm'),
    grade: allOf(
      craft('Envelope sharp share drops; no overhang over 45° on that face', {
        part: 'upper-arm',
        sharpShareDrops: true,
        maxOverhangDeg: 45,
        face: 'top',
      }),
    ),
  },
  {
    id: 'K3',
    category: 'craft',
    title: 'Simplify the torso exterior',
    heldOut: true,
    instruction: 'simplify the torso exterior',
    realScene: 'k3-torso-before-simplify',
    fixture: () => craftBlocks('torso'),
    grade: allOf(
      craft('Sharp share and feature count drop; nothing internal exposed', {
        part: 'torso-shell',
        sharpShareDrops: true,
        featureCountDrops: true,
        noExposedInternals: true,
      }),
    ),
  },
  {
    id: 'K4',
    category: 'craft',
    title: 'Solid limbs',
    instruction: 'Make these look designed, not like blocks',
    realScene: 'sprout',
    fixture: () => craftBlocks('limbs'),
    grade: allOf(
      craft('No part over 0.85 solidity unless tagged a grip; wall consistency in band', {
        maxSolidity: 0.85,
        wallConsistency: true,
      }),
    ),
  },
];

export const MIRROR_TASKS = [
  {
    id: 'M1',
    category: 'mirror',
    title: 'Mirror the leg',
    instruction: 'Mirror the leg',
    fixture: () => legs({ sides: ['left'] }),
    grade: allOf(servoOutputsMirrored(0.5)),
    solution: () => legs(),
  },
  {
    id: 'M2',
    category: 'mirror',
    title: 'Update the right foot',
    heldOut: true,
    instruction: 'Update the right foot',
    fixture: () => feet(),
    grade: allOf(twinsMatch('left-foot', 'right-foot', 0.01)),
    solution: () => feet({ rightEdited: true }),
  },
];

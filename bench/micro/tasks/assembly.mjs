import { boltedPair } from '../bolted.mjs';
import {
  allOf,
  driverAccess,
  engagementDepth,
  headsSeated,
  heldBy,
  noShankInMaterial,
  screwsEngaged,
  adapterOr,
} from '../checks.mjs';
import { FAULTS } from '../faults.mjs';
import { effectorCap, headHalves, torsoWithArms } from '../standins.mjs';

const RUN_AND_FIX = 'Run checks and fix';

const FAULT_TASKS = [
  {
    fault: 'missingInsert',
    title: 'Insert deleted',
    instruction: (name) => `Make the ${name} fastening buildable`,
    grade: () => allOf(screwsEngaged()),
  },
  {
    fault: 'shortScrew',
    title: 'Screw 4 mm short',
    instruction: (name) => `Check the ${name} screws`,
    grade: () => allOf(screwsEngaged(), engagementDepth()),
  },
  {
    fault: 'sideways',
    title: 'Screw 2 mm sideways',
    instruction: () => RUN_AND_FIX,
    grade: () => allOf(screwsEngaged(), noShankInMaterial()),
  },
  {
    fault: 'sunk',
    title: 'Screw head sunk 3 mm',
    instruction: () => RUN_AND_FIX,
    grade: () => allOf(headsSeated(), noShankInMaterial()),
  },
];

const LAYOUT_TASKS = [
  { ids: ['A1', 'A2', 'A7', 'A8'], layouts: ['visor', 'torso', 'torso', 'torso'] },
  { ids: ['A9', 'A10', 'A11', 'A12'], layouts: ['arm', 'arm', 'arm', 'arm'] },
];

const LAYOUT_NAMES = { visor: 'visor', torso: 'torso-to-pelvis', arm: 'upper arm to shoulder' };
const SOLUTION = (layout) => () => boltedPair({ layout });

function faultTasks() {
  return LAYOUT_TASKS.flatMap(({ ids, layouts }, row) =>
    FAULT_TASKS.map((t, i) => {
      const layout = layouts[i];
      const name = LAYOUT_NAMES[layout];

      return {
        id: ids[i],
        category: 'assembly',
        title: `${t.title} (${layout})`,
        heldOut: row === 1,
        instruction: t.instruction(name),
        fixture: () => FAULTS[t.fault](boltedPair({ layout })),
        grade: t.grade(),
        solution: SOLUTION(layout),
      };
    }),
  );
}

const shellScrews = torsoWithArms().meta.shellScrews;

export const ASSEMBLY_TASKS = [
  ...faultTasks(),
  {
    id: 'A3',
    category: 'assembly',
    title: 'Effector enlarged over its screws',
    instruction: 'Fix whatever the last edit broke',
    fixture: () => effectorCap({ capD: 48 }),
    grade: allOf(headsSeated(), screwsEngaged(), driverAccess()),
    solution: () => effectorCap(),
  },
  {
    id: 'A4',
    category: 'assembly',
    title: 'Upper arm with no fasteners',
    instruction: 'Make the upper arm attach to the shoulder',
    fixture: () => boltedPair({ layout: 'arm', bare: true, base: { id: 'torso', name: 'Torso' } }),
    grade: allOf(heldBy('upper-arm', 'torso'), screwsEngaged(), noShankInMaterial()),
    solution: () => boltedPair({ layout: 'arm', base: { id: 'torso', name: 'Torso' } }),
  },
  {
    id: 'A5',
    category: 'assembly',
    title: 'Head halves screwed from the wrong side',
    instruction: 'Make the head halves assemblable',
    fixture: () => headHalves(),
    realScene: 'a5-head-halves',
    grade: allOf(screwsEngaged(), headsSeated(), driverAccess()),
  },
  {
    id: 'A6',
    category: 'assembly',
    title: 'Shell screws under the arms',
    heldOut: true,
    instruction: 'Make the shell removable without removing the arms',
    fixture: () => torsoWithArms(),
    realScene: 'a6-torso-under-arms',
    grade: allOf(
      adapterOr({
        adapter: 'serviceDepth',
        label: 'Shell comes off without removing the arms',
        args: { target: 'torso-shell', forbid: ['left-upper-arm', 'right-upper-arm'] },
        minimal: driverAccess(shellScrews),
      }),
      screwsEngaged(),
    ),
  },
];

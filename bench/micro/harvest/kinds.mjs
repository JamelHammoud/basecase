import { boltedPair, LAYOUT_NAMES } from '../bolted.mjs';
import {
  allOf,
  driverAccess,
  engagementDepth,
  headsSeated,
  neededEngagementMm,
  noShankInMaterial,
  screwsEngaged,
} from '../checks.mjs';
import { FAULTS } from '../faults.mjs';
import { probeFasteners } from '../fasteners.mjs';

const RUN_AND_FIX = 'Run checks and fix';

const kind = ({
  row = 'Screws',
  grader,
  guards = [],
  plant = null,
  title,
  words,
  instruction = () => RUN_AND_FIX,
}) => ({
  row,
  grader,
  graderName: grader().checkName,
  grade: () => allOf(grader(), ...guards.map((g) => g())),
  plant,
  title,
  words,
  instruction,
});

export const FAULT_KINDS = {
  air: kind({
    grader: screwsEngaged,
    plant: 'missingInsert',
    title: 'Insert deleted',
    words:
      /end(?:s|ing)? in (?:the )?air|(?:don'?t|doesn'?t|do not|does not) (?:grip|engage)|missing inserts?|without (?:an? )?(?:insert|nut)/i,
    instruction: (name) => `Make the ${name} fastening buildable`,
  }),
  orphan: kind({
    grader: screwsEngaged,
    guards: [headsSeated],
    plant: 'missingScrew',
    title: 'Insert with no screw',
    words: /(?:empty|orphan(?:ed)?|unused) inserts?|inserts? (?:with|has|have) no screws?/i,
    instruction: (name) => `Check the ${name} fastening`,
  }),
  short: kind({
    grader: engagementDepth,
    guards: [screwsEngaged],
    plant: 'shortScrew',
    title: 'Screw 4 mm short',
    words: /screws? (?:are |is )?too short|short (?:screws?|engagement)|(?:not enough|shallow) thread/i,
    instruction: (name) => `Check the ${name} screws`,
  }),
  uncut: kind({
    grader: noShankInMaterial,
    guards: [screwsEngaged],
    plant: 'sideways',
    title: 'Screw 2 mm sideways',
    words: /no (?:clearance )?hole|without (?:a )?hole|through solid|shanks? (?:in|inside|into) (?:the )?material/i,
  }),
  unseated: kind({
    grader: headsSeated,
    guards: [screwsEngaged],
    plant: 'lifted',
    title: 'Screw head lifted 1.5 mm',
    words:
      /heads? (?:float(?:s|ing)?|not seated|unseated|lifted)|loose screw heads?|nothing (?:sits )?under (?:the )?heads?/i,
  }),
  sunk: kind({
    grader: headsSeated,
    guards: [noShankInMaterial],
    plant: 'sunk',
    title: 'Screw head sunk 3 mm',
    words: /(?:buried|sunk(?:en)?) (?:screw )?heads?|heads? (?:are |is )?(?:buried|sunk)/i,
  }),
  'stuck-screw': kind({
    row: 'Assembly',
    grader: driverAccess,
    guards: [screwsEngaged],
    title: 'Driver blocked',
    words:
      /(?:driver|hex key|screwdriver) (?:can'?t|cannot|won'?t) reach|can'?t reach (?:the |these |its )?screws?|driver access/i,
  }),
};

export const UNGRADED_KINDS = {
  unheld: /(?:loose|floating|unattached) parts?|(?:isn'?t|not|aren'?t) (?:attached|fastened|held)/i,
  bottoms: /screws? (?:are |is )?too long|bottoms? out/i,
  'insert-hole': /insert holes? (?:is |are )?(?:too )?small/i,
  'insert-wall': /thin walls? around (?:the )?inserts?/i,
  'misses-hole': /(?:off|miss(?:es)?) (?:its |their |the )?(?:mounting )?holes?/i,
  'stuck-part': /won'?t go in|can'?t be (?:put in|assembled|inserted)/i,
  clash: /overlap(?:s|ping)?|interfer(?:e|es|ence)|clash(?:es)?/i,
  'lead-room': /battery (?:wires?|leads?|connectors?)/i,
  bed: /too big (?:for|to print)|(?:doesn'?t|won'?t) fit (?:the |on the )?(?:plate|bed)/i,
  thin: /thin walls?|walls? (?:are |is )?too thin/i,
  support: /support material|overhangs?/i,
  'stand-in': /placeholders?|stand-?ins?|block-?outs?/i,
  'no-price': /no prices?|missing prices?|unpriced/i,
  service: /(?:repair|replace|service)\w* .{0,40}(?:take|taking) .{0,20}apart/i,
};

export const coverageKey = (kindName) => `${FAULT_KINDS[kindName].graderName}:${kindName}`;

export function kindOfText(text = '') {
  const graded = Object.entries(FAULT_KINDS).find(([, k]) => k.words.test(text));

  if (graded) return { kind: graded[0], graded: true };

  const ungraded = Object.entries(UNGRADED_KINDS).find(([, words]) => words.test(text));

  return { kind: ungraded?.[0] ?? null, graded: false };
}

const SCREW_FAULTS = [
  ['air', (s) => s.engagementMm < 1],
  ['short', (s) => s.engagementMm >= 1 && s.engagementMm < neededEngagementMm(s)],
  ['uncut', (s) => s.shankInMaterial.length > 0],
  ['unseated', (s) => !s.headSeated && !s.headSunk],
  ['sunk', (s) => s.headSunk],
  ['stuck-screw', (s) => !s.driverClear],
];

export function faultsIn(scene) {
  const probe = probeFasteners(scene);
  const screwFaults = SCREW_FAULTS.flatMap(([name, has]) => {
    const ids = probe.screws.filter(has).map((s) => s.id);

    return ids.length ? [{ kind: name, ids }] : [];
  });

  return probe.orphanInserts.length ? [...screwFaults, { kind: 'orphan', ids: probe.orphanInserts }] : screwFaults;
}

export function harvestedTask(stub) {
  const { kind: name, layout } = stub.fault;
  const k = FAULT_KINDS[name];

  if (!k?.plant) throw new Error(`Harvested task ${stub.id} names ${name}, which has no planted fault`);

  return {
    id: stub.id,
    category: stub.category ?? 'assembly',
    title: stub.title ?? `${k.title} (${layout})`,
    heldOut: !!stub.heldOut,
    instruction: stub.instruction ?? k.instruction(LAYOUT_NAMES[layout]),
    source: stub.source,
    fault: stub.fault,
    fixture: () => FAULTS[k.plant](boltedPair({ layout })),
    grade: k.grade(),
    solution: () => boltedPair({ layout }),
    harvested: true,
  };
}

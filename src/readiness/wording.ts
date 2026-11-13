import type { Finding, FindingArea, FindingFix, FindingLevel } from './types';

interface Rule {
  area: FindingArea;
  check: string;
  name: string;
  text: string;
}

const SCREWS = 'Screws';
const ATTACHED = 'Parts attached';
const ASSEMBLY = 'Assembly';
const REPAIRS = 'Repairs';
const FIT = 'Fit';
const PRINTING = 'Printing';
const REAL_PARTS = 'Real parts';

export const READINESS_CHECKS = [ATTACHED, SCREWS, ASSEMBLY, FIT, PRINTING, REAL_PARTS, REPAIRS];

const screw = (name: string, text: string): Rule => ({ area: 'assembly', check: SCREWS, name, text });
const assembly = (name: string, text: string): Rule => ({ area: 'assembly', check: ASSEMBLY, name, text });
const fit = (check: string, name: string, text: string): Rule => ({ area: 'fit', check, name, text });
const printing = (name: string, text: string): Rule => ({ area: 'printing', check: PRINTING, name, text });
const sourcing = (name: string, text: string): Rule => ({ area: 'parts', check: REAL_PARTS, name, text });

export const RULES = {
  air: screw('Screws Ending in Air', "These screws don't grip anything. Each needs an insert, a nut or more material."),
  uncut: screw('Screws Without Holes', 'These screws run through solid material, so they need a hole cut for them.'),
  unseated: screw('Loose Screw Heads', 'Nothing sits under these screw heads, so they can’t tighten.'),
  sunk: screw('Buried Screw Heads', 'These screw heads are buried inside another part.'),
  bottoms: screw('Screws Too Long', 'These screws are too long and hit the bottom of their holes.'),
  short: screw('Screws Too Short', 'These screws are too short to hold well.'),
  orphan: screw('Empty Inserts', 'These threaded inserts have no screw going into them.'),
  'insert-hole': fit(SCREWS, 'Small Insert Holes', 'This hole is too small for its threaded insert.'),
  'insert-wall': fit(
    SCREWS,
    'Thin Walls Around Inserts',
    'The wall around this insert could break when it’s pressed in.',
  ),
  'misses-hole': fit(SCREWS, 'Screws Off Their Holes', 'This screw doesn’t line up with a mounting hole.'),
  'too-deep': fit(SCREWS, 'Screws Too Deep', 'This screw goes too deep and could damage the part.'),
  'screw-in-part': fit(SCREWS, 'Screws Into Parts', 'Check there’s a threaded hole where this screw lands.'),
  unheld: {
    area: 'assembly',
    check: ATTACHED,
    name: 'Loose Parts',
    text: 'These parts aren’t attached to anything, so they’d fall loose.',
  },
  declared: {
    area: 'assembly',
    check: ATTACHED,
    name: 'Parts Held by a Note',
    text: 'These parts are held by something that isn’t modeled, like a strap or tape.',
  },
  'stuck-screw': assembly('Screws You Can’t Reach', 'A screwdriver can’t reach these screws, in any build order.'),
  'stuck-part': assembly('Parts That Won’t Go In', 'These parts can’t be put in place, in any build order.'),
  order: assembly('Build Order', 'Some screws have to go in before other parts cover them.'),
  tool: assembly('Hard-to-Reach Screws', 'These screws need an L-shaped hex key to reach.'),
  split: assembly('Parts That Wrap Others', 'This part wraps around others and can’t come off in one piece.'),
  lip: assembly('Snug Parts', 'This part only comes off with a tilt or a bit of flex.'),
  'fixed-mate': assembly('Fixed Mates', 'This mate imports as fixed; only revolute and slider mates move.'),
  'gone-mate': assembly('Missing Mates', 'These joints have no mate in Onshape.'),
  service: {
    area: 'assembly',
    check: REPAIRS,
    name: 'Slow Repairs',
    text: 'Replacing these means taking a lot apart.',
  },
  clash: fit(FIT, 'Overlapping Parts', 'These parts overlap.'),
  'lead-room': fit(FIT, 'Tight Battery Wires', 'There isn’t enough room for the battery’s wires and connector.'),
  bed: printing('Parts Too Big to Print', 'This part is too big for your printer’s plate.'),
  thin: printing('Thin Walls', 'This part has a wall too thin to print, so it would come out with holes.'),
  edge: printing('Thin Edges', 'A thin edge here may not print cleanly. It’s usually fine.'),
  support: printing('Heavy Supports', 'This part needs a lot of support material to print.'),
  unprintable: printing('Clear Parts', 'This part is meant to be clear, which a printer can’t make.'),
  'stand-in': sourcing('Placeholders', 'This is a placeholder, not a real part.'),
  'no-source': sourcing('Parts Without a Source', 'Nothing says where to get this part.'),
  unreferenced: sourcing('Unconfirmed Parts', 'Its link and numbers aren’t checked.'),
  'no-price': sourcing('Missing Prices', 'These parts have no price.'),
  unfinished: assembly('Unfinished Checks', 'Some checks didn’t finish, so this answer isn’t complete.'),
  hidden: fit(FIT, 'Hidden Parts', 'These hidden parts weren’t checked.'),
} satisfies Record<string, Rule>;

export type RuleCode = keyof typeof RULES;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const keyOf = (scope: string, ids: string[], text: string) =>
  `${scope}:${ids.length ? [...ids].sort().join('+') : slug(text).slice(0, 60)}`;

export function ruleFinding(
  code: RuleCode,
  level: FindingLevel,
  f: { agentText: string; text?: string; ids?: string[]; subject?: string },
): Finding {
  const rule: Rule = RULES[code];
  const ids = f.ids ?? [];

  return {
    key: f.subject ? `${rule.area}:${code}:${f.subject}` : keyOf(`${rule.area}:${code}`, ids, f.agentText),
    level,
    area: rule.area,
    check: rule.check,
    rule: code,
    ruleName: rule.name,
    text: f.text ?? rule.text,
    agentText: f.agentText,
    ids,
  };
}

const PLAIN_ENGINEERING: Record<string, Partial<Record<FindingLevel, string>>> = {
  'Servo torque': { blocker: 'This servo is too weak for its joint.', note: 'This servo is close to its limit.' },
  'Peak torque': {
    blocker: 'This servo gets pushed past its limit while walking.',
    note: 'This servo has little to spare while walking.',
  },
  'Torque estimates': { note: 'These joints have no servo, so the simulation guesses their torque from weight.' },
  'Servo models': { note: 'These servos aren’t calibrated on this robot, so the simulation uses their catalog model.' },
  'Servo alignment': { blocker: 'These servos don’t line up with their joints.' },
  'Joint support': { note: 'These joints are held on one side only, which strains the servo.' },
  'Range of motion': {
    blocker: 'This joint hits another part before the end of its range.',
    note: 'This joint hits another part before its motor limit.',
  },
  'Servo voltage': { blocker: 'The supply voltage doesn’t suit these servos.' },
  'Current and runtime': { blocker: 'The battery can’t supply enough current for the servos.' },
  'Supply current': { blocker: 'The tether can’t supply enough current for the servos.' },
  'Heat near servos': { note: 'Some parts touching servos are PLA, which softens from servo heat.' },
  'Standing stability': {
    blocker: 'The robot would tip over standing still.',
    note: 'The robot is close to tipping over.',
  },
};

const titleCase = (text: string) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function engineeringFinding(
  check: string,
  level: FindingLevel,
  f: { detail: string; ids?: string[]; fix?: FindingFix },
): Finding {
  const code = slug(check);
  const plain = PLAIN_ENGINEERING[check]?.[level];
  const agentText = `${check}: ${f.detail}`;
  const ids = f.ids ?? [];

  return {
    key: keyOf(`design:${code}`, ids, agentText),
    level,
    area: 'design',
    check,
    rule: code,
    ruleName: `${titleCase(check)} Checks`,
    text: plain ?? f.detail,
    agentText,
    detail: plain ? f.detail : undefined,
    ids,
    ...(f.fix ? { fix: f.fix } : {}),
  };
}

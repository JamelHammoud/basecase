import { hasLabel, sameTitle } from './github.mjs';

export const MIN_ARCS = 3;
export const MAX_ARCS = 6;
export const BIG_BET = 'loop:big-bet';
export const PROGRESS_DAYS = 14;

const ARC_LINE = /^Arc: *(.*)$/m;
const TASKS_HEADING = '## Steps';

export const isBigBet = (arc) => hasLabel(arc, BIG_BET);

const asNumber = (ref) => {
  if (Number.isInteger(ref)) return ref;

  const match = /^#?(\d+)$/.exec(String(ref).trim());

  return match ? Number(match[1]) : null;
};

export function arcRef(body) {
  const line = ARC_LINE.exec(body ?? '')?.[1]?.trim();

  if (!line) return null;

  const number = asNumber(line);

  return number ? { number } : { title: line };
}

export function arcOf(step, arcs) {
  const ref = arcRef(step.body);

  if (!ref) return null;

  if (ref.number) return ref.number;

  return arcs.find((arc) => sameTitle(arc.title, ref.title))?.number ?? null;
}

export const withArc = (body, number) =>
  ARC_LINE.test(body) ? body.replace(ARC_LINE, `Arc: #${number}`) : `Arc: #${number}\n${body}`;

const hasTask = (body, number) => new RegExp(`^- \\[[ x]\\] #${number}$`, 'm').test(body);

export function withTask(body, number) {
  if (hasTask(body, number)) return body;

  const tasks = body.includes(`\n${TASKS_HEADING}\n`) ? body.trimEnd() : `${body.trimEnd()}\n\n${TASKS_HEADING}\n`;

  return `${tasks}\n- [ ] #${number}`;
}

export const withoutTasks = (body) => (body ?? '').split(`\n${TASKS_HEADING}\n`)[0].trimEnd();

function retirementBlock(retire, open, retired) {
  const arc = open.find((a) => a.number === retire.number);

  if (!arc || retired.has(retire.number)) return 'it is not an open arc';

  if (
    retire.into &&
    (retire.into === retire.number || retired.has(retire.into) || !open.some((a) => a.number === retire.into))
  )
    return `#${retire.into} is not an open arc`;

  const left = open.filter((a) => a.number !== retire.number && !retired.has(a.number));

  if (left.length < MIN_ARCS) return `that would leave fewer than ${MIN_ARCS} arcs open`;

  return isBigBet(arc) && !left.some(isBigBet) ? 'it is the last big bet open' : null;
}

export function planArcs(open, output) {
  const retired = new Map();
  const kept = [];

  for (const retire of output.retireArcs ?? []) {
    const why = retirementBlock(retire, open, retired);

    if (why) kept.push({ number: retire.number, why });
    else retired.set(retire.number, { ...retire, into: retire.into ?? null });
  }

  const room = Math.max(0, MAX_ARCS - (open.length - retired.size));
  const newArcs = output.newArcs ?? [];

  return {
    retire: [...retired.values()],
    kept,
    opening: newArcs.slice(0, room),
    refused: newArcs.slice(room).map((arc) => arc.title),
  };
}

export function resolveArc(ref, { open, opened, refused, movedTo }) {
  const number = asNumber(ref);
  const follow = (n) => (movedTo.has(n) ? follow(movedTo.get(n)) : n);

  if (number) return open.some((arc) => arc.number === follow(number)) ? { number: follow(number) } : { number: null };

  const title = String(ref);
  const fresh = [...opened].find(([openedTitle]) => sameTitle(openedTitle, title));

  if (fresh) return { number: fresh[1] };

  if (refused.some((refusedTitle) => sameTitle(refusedTitle, title))) return { refused: true };

  const existing = open.find((arc) => sameTitle(arc.title, title));

  return { number: existing ? existing.number : null };
}

export function progress(arcs, { open, merged }) {
  const byArc = new Map(arcs.map((arc) => [arc.number, { open: [], merged: [] }]));
  const unlinked = [];

  for (const step of open) {
    const entry = byArc.get(arcOf(step, arcs));

    if (entry) entry.open.push(step);
    else unlinked.push(step);
  }

  for (const step of merged) byArc.get(arcOf(step, arcs))?.merged.push(step);

  return { byArc, unlinked };
}

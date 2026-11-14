import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { StoredTry } from '../cases/tryFile';
import { LABEL_LIMITS, labelsOf, retagged, tagsFrom, withLabels, type TryLabels } from '../cases/tryLabels';
import { editTries, loadManifests, loadRecording, loadStrip, saveLabels } from '../cases/tryStore';
import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { blobToDataUrl } from '../utils/imageEncode';
import type { Rig } from '../utils/kinematics';
import { labelPass } from './tryLabelPass';
import { plural } from '../../electron/plural.mjs';

type Payload = Record<string, unknown>;

export type LabelPass = typeof labelPass;

export interface TryLabelContext {
  parts: () => ScenePart[];
  setAction: (action: string) => void;
  cases: { cases: Case[] };
  tryRead: { model: () => SimModel | null; rig: () => Rig; partners: () => SlotRobot[] };
}

interface LabelWrite {
  try: string;
  instruction?: string;
  segments?: string[];
  tags?: string[];
}

const MAX_READS = 8;
const MAX_WRITES = 200;

const round = (n: number) => Math.round(n * 100) / 100;

const clipped = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const isText = (v: unknown): v is string => typeof v === 'string';

const isRecord = (v: unknown): v is Payload => typeof v === 'object' && v !== null && !Array.isArray(v);

const idsOf = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter(isText).map((id) => id.trim()))].filter(Boolean).slice(0, MAX_READS) : [];

function writeOf(v: unknown): LabelWrite | null {
  if (!isRecord(v) || !isText(v.try) || !v.try.trim()) return null;

  return {
    try: v.try.trim(),
    ...(isText(v.instruction) ? { instruction: v.instruction } : {}),
    ...(Array.isArray(v.segments) ? { segments: v.segments.map((s) => (isText(s) ? s : '')) } : {}),
    ...(Array.isArray(v.tags) ? { tags: v.tags.filter(isText) } : {}),
  };
}

const writesOf = (v: unknown) =>
  Array.isArray(v) ? v.slice(0, MAX_WRITES).flatMap((w) => writeOf(w) ?? []) : ([] as LabelWrite[]);

const labelOf = (stored: StoredTry) => stored.case?.name ?? stored.task ?? stored.robot.name;

function segmentsSaid(labels: TryLabels, said: string[]): Partial<TryLabels> {
  const instructions = said.map((s) => clipped(s, LABEL_LIMITS.instruction));

  if (!instructions.some(Boolean)) return {};

  return {
    segments: labels.segments.map((s, i) => (instructions[i] ? { ...s, instruction: instructions[i] } : s)),
    by: 'agent',
  };
}

function changeOf(labels: TryLabels, write: LabelWrite): Partial<TryLabels> {
  const instruction = clipped(write.instruction, LABEL_LIMITS.instruction);
  const added = tagsFrom((write.tags ?? []).join(','));

  return {
    ...(instruction ? { instruction } : {}),
    ...(added.length ? { tags: retagged(labels.tags, { add: added, remove: [] }) } : {}),
    ...segmentsSaid(labels, write.segments ?? []),
  };
}

function countProblem(stored: StoredTry, write: LabelWrite) {
  const count = labelsOf(stored).segments.length;
  const given = write.segments?.length;

  if (given === undefined || given === count) return null;

  return `${stored.id} has ${plural(count, 'segment')}, not ${given}. Give one instruction per segment, in order, '' to leave one as it is.`;
}

function applied(stored: StoredTry, writes: LabelWrite[], problems: string[]): StoredTry | null {
  let next = stored;

  for (const write of writes) {
    const refused = countProblem(next, write);

    if (refused) problems.push(refused);

    const change = refused ? {} : changeOf(labelsOf(next), write);

    if (Object.keys(change).length) next = withLabels(next, change);
  }

  return next === stored ? null : next;
}

async function writeLabels(writes: LabelWrite[], problems: string[]) {
  const ids = [...new Set(writes.map((w) => w.try))];
  const seen = new Set<string>();
  const edited = new Set<string>();
  const saved = await editTries(ids, (stored) => {
    seen.add(stored.id);

    const next = applied(
      stored,
      writes.filter((w) => w.try === stored.id),
      problems,
    );

    if (next) edited.add(stored.id);

    return next;
  });
  const kept = new Set(saved.map((s) => s.id));

  for (const id of ids) if (!seen.has(id)) problems.push(`No try ${id}.`);

  for (const id of edited) if (!kept.has(id)) problems.push(`Couldn’t save ${id}’s labels.`);

  return saved.length;
}

async function labelled(stored: StoredTry, ctx: TryLabelContext, pass: LabelPass) {
  if (stored.labels?.segments.length) return stored;

  const recording = await loadRecording(stored.id).catch(() => null);

  if (!recording) return stored;

  const { tryRead } = ctx;

  return pass(stored, recording, {
    model: tryRead.model(),
    rig: tryRead.rig(),
    parts: ctx.parts(),
    cases: ctx.cases.cases,
    partners: tryRead.partners,
  }).catch(() => stored);
}

const tryPayload = (stored: StoredTry) => {
  const labels = labelsOf(stored);
  const rate = stored.rate > 0 ? stored.rate : 1;

  return {
    try: stored.id,
    label: labelOf(stored),
    robot: stored.robot.name,
    verdict: stored.outcome.verdict,
    seconds: round(stored.seconds),
    frames: stored.frames,
    rate: stored.rate,
    instruction: labels.instruction ?? null,
    tags: labels.tags,
    segments: labels.segments.map((s, index) => ({
      index,
      from_s: round(s.from / rate),
      to_s: round(s.to / rate),
      label: s.label,
      instruction: s.instruction ?? null,
    })),
    flags: labels.flags.map((f) => ({ kind: f.kind, at: round(f.at), joint: f.joint ?? null })),
  };
};

async function stripOf(stored: StoredTry) {
  const strip = await loadStrip(stored.id).catch(() => null);

  if (!strip) return [];

  return [{ view: `${stored.id}’s filmstrip`, dataUrl: await blobToDataUrl(strip) }];
}

async function readLabels(
  ids: string[],
  ctx: TryLabelContext,
  { problems, pass }: { problems: string[]; pass: LabelPass },
) {
  const found = await loadManifests(ids);
  const known = new Set(found.map((s) => s.id));

  for (const id of ids) if (!known.has(id)) problems.push(`No try ${id}.`);

  const tries: StoredTry[] = [];

  for (const stored of found) tries.push(await labelled(stored, ctx, pass));

  const changed = tries.filter((t, i) => t !== found[i]);

  if (changed.length) await saveLabels(changed);

  const images = (await Promise.all(tries.map(stripOf))).flat();

  return { tries: tries.map(tryPayload), images };
}

export async function labelTries(payload: Payload, ctx: TryLabelContext, pass: LabelPass = labelPass) {
  const ids = idsOf(payload.tries);
  const writes = writesOf(payload.labels);

  if (!ids.length && !writes.length) return { ok: false, problem: 'Give tries to read or labels to write.' };

  ctx.setAction('Labeling tries');

  const problems: string[] = [];
  const written = writes.length ? await writeLabels(writes, problems) : undefined;
  const read = ids.length ? await readLabels(ids, ctx, { problems, pass }) : undefined;

  return {
    ok: true,
    ...(written === undefined ? {} : { written }),
    ...(read ? { tries: read.tries } : {}),
    problems,
    ...(read?.images.length ? { images: read.images } : {}),
  };
}

export const TRY_LABEL_HANDLERS = {
  label_tries: (payload: Payload, ctx: TryLabelContext) => labelTries(payload, ctx),
};

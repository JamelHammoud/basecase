import type { StoredTry } from '../cases/tryFile';
import { renamed, withTags, type LabelPatch, type TrySegment } from '../cases/tryLabels';
import { relabelTries, type Relabel } from '../cases/tryStore';
import type { TryLooker } from './agentTryLook';
import { plural } from '../../electron/plural.mjs';

export interface SegmentEdit {
  index: number;
  label?: string;
  instruction?: string;
  tags?: string[];
}

export interface TryEdit {
  id: string;
  instruction?: string;
  tags?: string[];
  segments?: SegmentEdit[];
}

interface Written {
  id: string;
  instruction?: string;
  tags?: string[];
  segments?: Array<{ index: number; label: string; instruction?: string; tags?: string[] }>;
}

type Load = (id: string) => Promise<StoredTry | null>;

const words = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const tagList = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []);

function editSegment(segments: TrySegment[], edit: SegmentEdit): TrySegment[] {
  const label = words(edit.label);
  const named = label ? renamed(segments, edit.index, label) : segments;

  return named.map((s, i) => {
    if (i !== edit.index) return s;

    const instruction = words(edit.instruction);
    const tags = tagList(edit.tags);

    return {
      ...s,
      ...(instruction ? { instruction } : {}),
      ...(tags.length ? { tags: withTags(s.tags, tags) } : {}),
    };
  });
}

async function segmentPatch(stored: StoredTry, edits: SegmentEdit[], look: TryLooker): Promise<TrySegment[] | string> {
  const base = stored.labels?.segments ?? (await look.ruleSegments(stored));

  if (!base?.length) {
    return `Try ${stored.id} has no segments: it was recorded in another scene, or its recording doesn’t fit this robot.`;
  }

  const missing = edits.find((e) => !Number.isInteger(e.index) || e.index < 0 || e.index >= base.length);

  if (missing) {
    return `Try ${stored.id} has ${plural(base.length, 'segment')}, 0 to ${base.length - 1}; there is no segment ${missing.index}.`;
  }

  return edits.reduce(editSegment, base);
}

function writtenOf(edit: TryEdit, patch: LabelPatch): Written {
  const edited = new Set((edit.segments ?? []).map((s) => s.index));

  return {
    id: edit.id,
    ...(patch.instruction ? { instruction: patch.instruction } : {}),
    ...(patch.tags ? { tags: patch.tags } : {}),
    ...(patch.segments
      ? {
          segments: patch.segments.flatMap((s, index) =>
            edited.has(index) ? [{ index, label: s.label, instruction: s.instruction, tags: s.tags }] : [],
          ),
        }
      : {}),
  };
}

async function patchFor(edit: TryEdit, load: Load, look: TryLooker): Promise<LabelPatch | string> {
  const stored = await load(edit.id);

  if (!stored) return `No try ${edit.id}.`;

  const instruction = words(edit.instruction);
  const tags = tagList(edit.tags);
  const segments = edit.segments?.length ? await segmentPatch(stored, edit.segments, look) : undefined;

  if (typeof segments === 'string') return segments;

  return {
    ...(instruction ? { instruction } : {}),
    ...(tags.length ? { tags: withTags(stored.labels?.tags, tags) } : {}),
    ...(segments ? { segments } : {}),
  };
}

export async function writeLabels(edits: TryEdit[], load: Load, look: TryLooker) {
  const changes: Relabel[] = [];
  const written: Written[] = [];
  const problems: string[] = [];

  const seen = new Set<string>();

  for (const edit of edits) {
    const patch = seen.has(edit.id)
      ? `Try ${edit.id} is listed twice; send its labels once.`
      : await patchFor(edit, load, look);

    seen.add(edit.id);

    if (typeof patch === 'string') {
      problems.push(patch);

      continue;
    }

    if (!Object.keys(patch).length) {
      problems.push(`Nothing to write for try ${edit.id}.`);

      continue;
    }

    changes.push({ id: edit.id, patch });
    written.push(writtenOf(edit, patch));
  }

  await relabelTries(changes);

  return { written, problems };
}

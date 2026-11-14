import { useState } from 'react';
import { mergeBack, moveEdge, renamed, segmentAt, splitAt, withTags, type TrySegment } from '../cases/tryLabels';
import { relabelTries } from '../cases/tryStore';

interface Edits {
  id: string;
  segments: TrySegment[];
  past: TrySegment[][];
  future: TrySegment[][];
}

const HISTORY = 100;

const same = (a: TrySegment[], b: TrySegment[]) => JSON.stringify(a) === JSON.stringify(b);

const tagged = (segments: TrySegment[], index: number, tag: string) =>
  segments.map((s, i) => (i === index ? { ...s, tags: withTags(s.tags, [tag]) } : s));

export function stepped(edits: Edits, back: boolean): Edits | null {
  const from = back ? edits.past : edits.future;
  const to = from.at(-1);

  if (!to) return null;

  return {
    id: edits.id,
    segments: to,
    past: back ? edits.past.slice(0, -1) : [...edits.past, edits.segments],
    future: back ? [...edits.future, edits.segments] : edits.future.slice(0, -1),
  };
}

export function useSegmentEdits(onError: (e: unknown) => void) {
  const [edits, setEdits] = useState<Edits | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const segments = edits?.segments ?? [];

  const save = (next: Edits) => {
    setEdits(next);
    relabelTries([{ id: next.id, patch: { segments: next.segments } }]).catch(onError);
  };

  const commit = (next: TrySegment[]) => {
    if (!edits || same(next, edits.segments)) return;

    save({ ...edits, segments: next, past: [...edits.past, edits.segments].slice(-HISTORY), future: [] });
  };

  const travel = (back: boolean) => {
    const next = edits && stepped(edits, back);

    if (!next) return false;

    save(next);
    setSelected(null);

    return true;
  };

  const merge = (frame: number) => {
    const index = selected ?? segmentAt(segments, frame);

    commit(mergeBack(segments, index));

    if (index > 0) setSelected(index - 1);
  };

  return {
    tryId: edits?.id ?? null,
    segments,
    selected: selected !== null && selected < segments.length ? selected : null,
    canUndo: !!edits?.past.length,
    canRedo: !!edits?.future.length,
    reset: (id: string | null, list: TrySegment[] = []) => {
      setEdits(id ? { id, segments: list, past: [], future: [] } : null);
      setSelected(null);
    },
    select: setSelected,
    split: (frame: number) => commit(splitAt(segments, frame)),
    merge,
    moveEdge: (index: number, frame: number) => commit(moveEdge(segments, index, frame)),
    rename: (index: number, label: string) => commit(renamed(segments, index, label)),
    tag: (index: number, tag: string) => commit(tagged(segments, index, tag)),
    undo: () => travel(true),
    redo: () => travel(false),
  };
}

export type SegmentEdits = ReturnType<typeof useSegmentEdits>;

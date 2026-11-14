import { useEffect, useEffectEvent, useState } from 'react';
import type { Case } from '../cases/schema';
import { segmentHistory, type SegmentHistory } from '../cases/segmentHistory';
import type { SlotRobot } from '../cases/slots';
import type { StoredTry } from '../cases/tryFile';
import {
  labelsOf,
  mergeIntoPrevious,
  moveBoundary,
  renameSegment,
  retagged,
  segmentAt,
  splitAt,
  withLabels,
  type TrySegment,
} from '../cases/tryLabels';
import { loadManifests, saveLabels } from '../cases/tryStore';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { tagChange } from './tagTries';
import { labelPass } from './tryLabelPass';

export interface LabelScene {
  model: SimModel | null;
  rig: Rig;
  parts: ScenePart[];
  cases: Case[];
  partners: () => SlotRobot[];
}

interface Held {
  id: string;
  stored: StoredTry;
  history: SegmentHistory;
}

interface LabelOptions {
  id: string | null;
  recording: Recording | null;
  scene: () => LabelScene;
}

async function labelled(id: string, recording: Recording, scene: LabelScene): Promise<Held | null> {
  const [stored] = await loadManifests([id]);

  if (!stored) return null;

  const next = await labelPass(stored, recording, scene);

  if (next !== stored) await saveLabels([next]);

  return { id, stored: next, history: segmentHistory(labelsOf(next).segments) };
}

const tagged = (segments: TrySegment[], index: number, tags: string[]) =>
  segments.map((s, i) => (i === index ? { ...s, tags } : s));

export function useTryLabels({ id, recording, scene }: LabelOptions) {
  const [held, setHeld] = useState<Held | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const current = held?.id === id ? held : null;
  const segments = current?.history.now ?? [];
  const read = useEffectEvent((at: string, from: Recording) => labelled(at, from, scene()));

  useEffect(() => {
    if (!id || !recording) return;

    let live = true;

    read(id, recording)
      .then((next) => {
        if (live) setHeld(next);
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [id, recording]);

  const keep = (history: SegmentHistory) => {
    if (!current) return;

    const stored = withLabels(current.stored, { segments: history.now, by: 'person' });

    setHeld({ id: current.id, stored, history });
    void saveLabels([stored]).catch(() => {});
  };

  const edit = (next: TrySegment[] | null) => {
    if (!current || !next) return false;

    keep(current.history.apply(next));

    return true;
  };

  const indexAt = (frame: number) => selected ?? segmentAt(segments, frame);

  return {
    stored: current?.stored ?? null,
    segments,
    flags: current ? labelsOf(current.stored).flags : [],
    selected,
    select: setSelected,
    canUndo: !!current?.history.canUndo,
    canRedo: !!current?.history.canRedo,
    split: (frame: number) => edit(splitAt(segments, frame)),
    merge: (frame: number) => {
      const merged = edit(mergeIntoPrevious(segments, indexAt(frame)));

      if (merged) setSelected(null);

      return merged;
    },
    move: (index: number, frame: number) => edit(moveBoundary(segments, index, frame)),
    rename: (index: number, label: string) => edit(renameSegment(segments, index, label)),
    tag: (index: number, text: string) => {
      const before = segments[index]?.tags ?? [];

      return edit(tagged(segments, index, retagged(before, tagChange(text, before))));
    },
    undo: () => {
      const back = current?.history.undo();

      if (back) keep(back);

      return !!back;
    },
    redo: () => {
      const forward = current?.history.redo();

      if (forward) keep(forward);

      return !!forward;
    },
  };
}

export type TryLabelsState = ReturnType<typeof useTryLabels>;

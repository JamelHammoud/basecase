import { useState, type RefObject } from 'react';
import type { GuidePlan } from '../guide/guideTypes';
import { labelsKey, labelsOn, partLetters, unlabeledNotes } from '../print/labels/partLetters';
import type { PlateFilesInput } from '../three/analysis/analysisOps';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';

interface PlateWriterOptions {
  project: ProjectSettings;
  parts: ScenePart[];
  partsRef: RefObject<ScenePart[]>;
  guidePlan: () => Promise<GuidePlan | null>;
  guideFingerprint: string;
  viewport: () => Viewport3DHandle | null;
}

export type PlateFiles = Pick<PlateFilesInput, 'files' | 'plateSize'>;

export function usePlateWriter(options: PlateWriterOptions) {
  const { project, partsRef, guidePlan, viewport } = options;
  const [notes, setNotes] = useState<Record<string, string>>({});

  const lettersNow = async () => {
    if (!labelsOn(project)) return undefined;

    const plan = await guidePlan().catch(() => null);

    return plan ? partLetters(plan, partsRef.current) : undefined;
  };

  const write = async (plates: PlateFiles): Promise<Record<string, Uint8Array>> => {
    const view = viewport();

    if (!view) return {};

    const labels = await lettersNow();
    const result = await view.printThreeMf({ ...plates, labels });

    setNotes(unlabeledNotes(result.unlabeled, labels ?? {}));

    return result.files;
  };

  return { write, notes, key: labelsKey(project, options.parts, options.guideFingerprint) };
}

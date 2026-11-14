import { useState, type RefObject } from 'react';
import type { GuidePlan } from '../guide/guideTypes';
import { labelsKey, lettersToWrite, unlabeledNotes } from '../print/labels/partLetters';
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

export interface WrittenPlates {
  files: Record<string, Uint8Array>;
  labels: string;
}

export function usePlateWriter(options: PlateWriterOptions) {
  const { project, partsRef, guidePlan, viewport } = options;
  const [notes, setNotes] = useState<Record<string, string>>({});

  const key = labelsKey(project, options.parts, options.guideFingerprint);

  const write = async (plates: PlateFiles): Promise<WrittenPlates> => {
    const view = viewport();

    if (!view) return { files: {}, labels: '' };

    const written = await lettersToWrite({ project, parts: partsRef.current, guidePlan, key });
    const result = await view.printThreeMf({ ...plates, labels: written.letters });

    setNotes(unlabeledNotes(result.unlabeled, written.letters ?? {}));

    return { files: result.files, labels: written.key };
  };

  return { write, notes, key };
}

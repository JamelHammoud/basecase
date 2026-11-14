import type { GuidePlan } from '../../guide/guideTypes';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import type { Unlabeled } from './partLabels';

export const labelsOn = (project: Pick<ProjectSettings, 'labelParts'>) => project.labelParts !== false;

export function labelsKey(project: ProjectSettings, parts: ScenePart[], guideFingerprint: string): string {
  if (!labelsOn(project)) return '';

  const off = parts.filter((p) => p.print?.noLabel).map((p) => p.id);

  return [guideFingerprint, ...off.sort()].join('|');
}

export function partLetters(plan: Pick<GuidePlan, 'items'>, parts: ScenePart[]): Record<string, string> {
  const off = new Set(parts.filter((p) => p.print?.noLabel).map((p) => p.id));

  return Object.fromEntries(
    plan.items
      .filter((item) => item.kind === 'printed')
      .flatMap((item) => item.partIds.filter((id) => !off.has(id)).map((id) => [id, item.label])),
  );
}

export interface LettersToWrite {
  letters?: Record<string, string>;
  key: string;
}

export async function lettersToWrite(options: {
  project: ProjectSettings;
  parts: ScenePart[];
  guidePlan: () => Promise<Pick<GuidePlan, 'items'> | null>;
  key: string;
}): Promise<LettersToWrite> {
  if (!labelsOn(options.project)) return { key: '' };

  const plan = await options.guidePlan().catch(() => null);

  return plan ? { letters: partLetters(plan, options.parts), key: options.key } : { key: '' };
}

export function unlabeledNote(letter: string, reason: Unlabeled['reason']): string {
  return reason === 'mesh'
    ? `Letter ${letter} left off: its mesh has open edges`
    : `Letter ${letter} left off: no flat face is hidden, free and big enough`;
}

export function unlabeledNotes(unlabeled: Unlabeled[], letters: Record<string, string>): Record<string, string> {
  return Object.fromEntries(unlabeled.map((u) => [u.id, unlabeledNote(letters[u.id] ?? '', u.reason)]));
}

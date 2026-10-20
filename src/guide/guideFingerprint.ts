import type { ProjectSettings, ScenePart } from '../types/robotics';
import { isBuilt } from './guidePlan';
import { hashText, itemKeyOf } from './guideItems';

const round = (v: number) => Math.round(v * 10) / 10;

const lines = new WeakMap<ScenePart, string>();

function partLine(p: ScenePart): string {
  const known = lines.get(p);

  if (known) return known;

  const line = [p.id, p.name, itemKeyOf(p), ...p.position.map(round), ...p.rotation.map(round), p.group?.id ?? ''].join(
    '|',
  );

  lines.set(p, line);

  return line;
}

export function guideFingerprint(title: string, parts: ScenePart[], project: ProjectSettings): string {
  const built = parts.filter(isBuilt).map(partLine).sort();
  const joints = (project.joints ?? []).map((j) =>
    [j.id, j.parent.join(','), j.child.join(','), j.limb ?? ''].join('|'),
  );

  return hashText([title, project.material, ...built, ...joints].join('\n'));
}

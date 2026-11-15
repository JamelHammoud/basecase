import { dimensionRows, type DimensionRow } from '../agent/cadTune';
import { COMPONENT_BY_ID } from '../data/components';
import { isBattery, isFoot } from '../utils/designSweep';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { servoStudyKnobs } from './servoDefaults';
import type { StudyKnob } from './types';

function dimensionValues(dim: DimensionRow): number[] {
  const step = Math.max(dim.step, Math.abs(dim.value) * 0.1);
  const clamp = (value: number) =>
    Number(Math.min(dim.max ?? Infinity, Math.max(dim.min ?? -Infinity, value)).toFixed(dim.precision));

  return [...new Set([dim.value, clamp(dim.value - step), clamp(dim.value + step)])];
}

export function defaultStudyKnobs(parts: ScenePart[], project: ProjectSettings): StudyKnob[] {
  const knobs = servoStudyKnobs(parts, project);

  const batteries = parts.filter(isBattery);
  const catalog = Object.values(COMPONENT_BY_ID)
    .filter((c) => c.battery && !c.battery.cell)
    .map((c) => `component:${c.id}`);

  if (batteries.length && catalog.length)
    knobs.push({
      id: 'battery',
      label: 'Battery',
      kind: 'battery',
      parts: batteries.map((p) => p.id),
      values: catalog,
    });

  if (parts.some(isFoot))
    knobs.push(
      {
        id: 'foot-length',
        label: 'Foot length',
        kind: 'foot',
        values: [{ length: 1 }, { length: 1.25 }, { length: 1.5 }],
      },
      { id: 'foot-width', label: 'Foot width', kind: 'foot', values: [{ width: 1 }, { width: 1.25 }, { width: 1.5 }] },
    );

  for (const part of parts.filter((p) => p.cad?.language === 'openscad')) {
    const dimensions: StudyKnob[] = dimensionRows(part.cad!.code).map((dim) => ({
      id: `dimension-${part.id}-${dim.name}`,
      label: `${part.name} ${dim.name}`,
      kind: 'dimension',
      part: part.id,
      name: dim.name,
      values: dimensionValues(dim),
    }));

    knobs.push(...dimensions);
  }

  return knobs;
}

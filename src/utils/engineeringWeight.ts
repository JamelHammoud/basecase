import { plural } from '../../electron/plural.mjs';
import type { RobotBody } from './engineeringBody';
import type { CheckContext, CheckRow, PartMass } from './engineeringTypes';
import { lengthLabel } from './size';
import { weight } from './weight';

export function weightRow(
  all: CheckContext['all'],
  masses: readonly PartMass[],
  bodies: readonly Pick<RobotBody, 'parts'>[],
): CheckRow {
  const owned = new Set<string>();
  const ids: string[] = [];
  let estimatedG = 0;
  let apartG = 0;
  let apartCount = 0;

  for (const body of bodies) {
    for (const id of body.parts) owned.add(id);
  }

  for (const mass of masses) {
    const id = mass.id;

    if (!owned.has(id)) {
      apartG += mass.grams;
      apartCount++;

      continue;
    }

    if (mass.source !== 'estimate') continue;

    ids.push(id);
    estimatedG += mass.grams;
  }

  const estimated = ids.length ? `. ${plural(ids.length, 'part')} estimated from volume (${weight(estimatedG)})` : '';
  const leftOut = apartCount ? `. Leaves out ${plural(apartCount, 'part')} off the robot (${weight(apartG)})` : '';

  return {
    check: 'Weight',
    status: ids.length ? 'warn' : 'pass',
    detail: `${weight(all.grams)}, center of mass ${lengthLabel(all.com[1])} up${estimated}${leftOut}`,
    ids,
  };
}

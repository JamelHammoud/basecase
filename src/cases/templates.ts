import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { reachTheFlagCase } from './reachTheFlag';
import { robotFacts, slotRefusal } from './robotFit';
import type { Case } from './schema';
import { touchTheDotsCase } from './touchTheDots';

export interface CaseTemplate {
  id: string;
  name: string;
  brief: string;
  refusal: string | null;
  build: () => Case;
}

export function caseTemplates(rig: Rig, parts: ScenePart[]): CaseTemplate[] {
  const facts = robotFacts(rig, parts);
  const ground = facts.capabilities.includes('legs') ? 'legs' : 'wheels';

  return [
    {
      id: 'touch-the-dots',
      name: 'Touch the Dots',
      brief: 'Touch each dot in order with the end effector.',
      refusal: slotRefusal({ needs: ['arm'], binding: {} }, facts),
      build: () => touchTheDotsCase(rig, parts),
    },
    {
      id: 'reach-the-flag',
      name: 'Reach the Flag',
      brief: 'Drive to the flag and stop on it.',
      refusal: slotRefusal({ needs: [ground], binding: {} }, facts),
      build: () => reachTheFlagCase(rig, parts),
    },
  ];
}

export function uniqueCaseId(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;

  let n = 2;

  while (taken.includes(`${base}-${n}`)) n++;

  return `${base}-${n}`;
}

import type { RobotFacts } from '../cases/robotFit';

const LEGS = ['walk to the box', 'turn around on the spot', 'step over a 2 cm bar', 'wave a front leg'];
const TWO_LEGS = ['walk to the box', 'squat and stand up', 'turn around on the spot', 'stand on one leg'];
const WHEELS = ['drive to the wall and stop', 'push the box 50 cm', 'spin in place'];
const STILL = ['hold this pose for 5 s'];
const ARM = ['touch the block', 'wave', 'lift the cube onto the shelf', 'point at the box'];

export function teachExamples(facts: Pick<RobotFacts, 'morphology' | 'endEffector'>, feet: number): string[] {
  if (facts.morphology === 'legged') return feet === 2 ? TWO_LEGS : LEGS;

  if (facts.morphology === 'wheeled' || facts.morphology === 'wheel-legged') return WHEELS;

  return facts.endEffector ? ARM : STILL;
}

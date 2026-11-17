import type { CustomModelDefinition } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export const HOUSEHOLD_FIXTURES = {
  cupboard: { object: 'Cupboard', name: 'Open a Cupboard', hinge: true, turn: [0, 0, -90] },
  door: { object: 'Door', name: 'Push a Door', hinge: true, turn: [0, 0, -90] },
  lever: { object: 'Lever', name: 'Operate a Lever', hinge: true, turn: [0, 0, 0] },
  knob: { object: 'Knob', name: 'Turn a Knob', hinge: true, turn: [0, 90, 0] },
  button: { object: 'Button', name: 'Press a Spring Button', hinge: false, turn: [0, 180, 0] },
  bin: { object: 'Bin', name: 'Tip a Hinged Bin', hinge: true, turn: [0, 0, 0] },
  gate: { object: 'Gate', name: 'Move a Sliding Gate', hinge: false, turn: [0, 90, 0] },
} satisfies Record<string, { object: string; name: string; hinge: boolean; turn: V3 }>;

export type HouseholdKind = keyof typeof HOUSEHOLD_FIXTURES;

export const isHouseholdKind = (kind: string): kind is HouseholdKind => Object.hasOwn(HOUSEHOLD_FIXTURES, kind);

export const fixtureHinge = (kind: string) =>
  kind === 'lid' || kind === 'chest' || (isHouseholdKind(kind) && HOUSEHOLD_FIXTURES[kind].hinge);

export const isFixtureGoal = (kind: string) =>
  kind === 'lid' || kind === 'drawer' || kind === 'chest' || isHouseholdKind(kind);

export function fixtureFitsGoal(model: CustomModelDefinition, kind: string): boolean {
  const type = model.joints?.find((joint) => joint.type !== 'fixed')?.type;

  return isFixtureGoal(kind) && type === (fixtureHinge(kind) ? 'revolute' : 'prismatic');
}

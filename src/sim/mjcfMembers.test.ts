import { describe, expect, it, vi } from 'vitest';
import * as members from '../utils/kinematicsMembers';
import { fixtureRobots } from './fixtures/robots';
import { fixturePackageJob } from './fixtures/robotPackage';
import { box, type FixtureRobot } from './fixtures/parts';

class ScannedParts extends Map<string, string[]> {
  private readonly owners: Map<string, string>;

  constructor(owners: Map<string, string>) {
    super();
    this.owners = owners;
  }

  override get(owner: string): string[] {
    return [...this.owners].filter(([, joint]) => joint === owner).map(([part]) => part);
  }
}

function compareLayouts(robot: FixtureRobot) {
  const indexed = fixturePackageJob(robot).job.model;
  const lookup = vi.spyOn(members, 'ownedPartsByJoint').mockImplementation((owners) => new ScannedParts(owners));

  try {
    expect(fixturePackageJob(robot).job.model).toEqual(indexed);
    expect(lookup).toHaveBeenCalledTimes(1);

    return indexed;
  } finally {
    lookup.mockRestore();
  }
}

describe('MJCF body membership', () => {
  it.each(fixtureRobots())('preserves the complete $id model through member edits', (robot) => {
    compareLayouts(robot);

    const edited: FixtureRobot = {
      ...robot,
      parts: robot.parts.map((part, i) => ({
        ...part,
        visible: i % 4 !== 0,
        role: i % 4 === 1 ? 'reference' : part.role,
        rotation: [i % 13, i % 17, i % 19],
      })),
      joints: robot.joints.map((current, i) => ({
        ...current,
        type: i % 4 === 0 ? 'fixed' : current.type,
      })),
    };

    compareLayouts(edited);
    compareLayouts({ ...edited, parts: edited.parts.toReversed(), joints: edited.joints.toReversed() });
  });

  it('indexes embedded members after adoption and refreshes after placement edits', () => {
    const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-6dof')!;
    const host = robot.parts.find((part) => robot.joints.some((current) => current.child.includes(part.id)))!;
    const embedded = box('embedded', [...host.position], [2, 2, 2], 5);
    const inside = compareLayouts({ ...robot, parts: [...robot.parts, embedded] });
    const carrier = inside.bodies.find((body) => body.parts.includes(embedded.id));

    expect(carrier?.joint).toBeDefined();

    const outside = compareLayouts({
      ...robot,
      parts: [...robot.parts, { ...embedded, position: [10000, 10000, 10000] }],
    });

    expect(outside.bodies.some((body) => body.parts.includes(embedded.id))).toBe(false);
  });
});

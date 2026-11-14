import { describe, expect, it } from 'vitest';
import { withMount, withRollBack } from '../../reality/projectCalibrations';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../../types/robotics';
import { jointMap } from './jointMap';

const joint = (id: string, parent: string, child: string): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [parent],
  child: [child],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
});

const project: ProjectSettings = {
  ...DEFAULT_PROJECT,
  joints: [joint('shoulder', 'base', 'upper'), joint('elbow', 'upper', 'fore')],
};

const mapOf = (p: ProjectSettings) =>
  jointMap({ model: { joints: [], robots: [] }, project: p, parts: [] as ScenePart[], name: 'arm' }).joints.map(
    ({ joint: name, zero_counts, direction }) => ({ name, zero_counts, direction }),
  );

describe('joint map zeros', () => {
  it('carries the zero and direction the camera found, and drops them on rollback', () => {
    const servo = { componentId: 'feetech-sts3215', variant: 'c001' };
    const found = withMount(project, 'elbow', {
      servo,
      verdict: 'measured',
      mount: { zeroCounts: 2185, direction: -1 },
      reason: '',
    });

    expect(mapOf(project)).toEqual([
      { name: 'shoulder', zero_counts: 2048, direction: 1 },
      { name: 'elbow', zero_counts: 2048, direction: 1 },
    ]);
    expect(mapOf(found)[1]).toEqual({ name: 'elbow', zero_counts: 2185, direction: -1 });
    expect(mapOf(withRollBack(found, 'elbow'))[1]).toEqual({ name: 'elbow', zero_counts: 2048, direction: 1 });
  });
});

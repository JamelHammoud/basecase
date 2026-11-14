import { beforeAll, describe, expect, it, vi } from 'vitest';
import { connectRobot, receiveRobotEvent, startRobotStore } from '../robot/robotStore';
import type { ServoRobotSpec } from '../robot/robotState';
import { fixtureRobot } from '../skills/fixtureModels';
import type { SkillRow } from '../skills/skillRows';
import { DEFAULT_PROJECT } from '../types/robotics';
import { fleetTools } from './useFleetRollOut';
import type { SceneSkills } from './useSkills';

const robot = fixtureRobot('quad-servo');
const project = { ...DEFAULT_PROJECT, joints: robot.joints };
const spec: ServoRobotSpec = { family: 'feetech', ids: [1, 2, 3], class: 'legged', emulated: true };
const pin = vi.fn(async () => ({ ok: true as const }));

beforeAll(async () => {
  startRobotStore({
    onRobotEvent: () => () => {},
    robotUnits: async () => [],
    robotPolicy: pin,
    robotConnect: async (spec, unit) => {
      receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });

      return { ok: true };
    },
  });
  await connectRobot(
    spec,
    robot.joints.map((joint) => joint.id),
    'quad-1',
  );
  await connectRobot(spec, ['other-shoulder'], 'arm-1');
});

describe('fleet rollout scene boundaries', () => {
  it('refuses another scene’s connected robot before proving or pinning a skill', async () => {
    const environmentOf = vi.fn();
    const setProject = vi.fn();
    const row: SkillRow = {
      target: 'kit:stand',
      label: 'Stand',
      kit: 'stand',
      move: null,
      record: null,
      state: { kind: 'ready', arena: '32 of 32 tries' },
      drives: false,
    };
    const skills = { rows: [row], environmentOf } as unknown as SceneSkills;
    const tools = fleetTools({ skills, projectRef: { current: project }, setProject });

    expect(await tools.rollOut({ skill: 'Stand', units: ['quad-1', 'arm-1'] })).toBe(
      'Choose a robot from this scene: arm-1.',
    );
    expect(environmentOf).not.toHaveBeenCalled();
    expect(pin).not.toHaveBeenCalled();
    expect(setProject).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import type { JointAxes } from '../joints/jointCandidates';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { findJointAxes } from './agentJointAxes';

const part = (id: string, extra: Partial<ScenePart> = {}) => ({ id, name: id, role: 'solid', ...extra }) as ScenePart;

const found: JointAxes = {
  candidates: [
    {
      parent: 'base',
      child: 'link',
      shaftOn: 'link',
      origin: [0, 48, 0],
      axis: [0, 0, 1],
      radius: 4,
      engaged: 40,
      travel: [-20, 20],
      confidence: 0.97,
    },
  ],
  fastened: [['bracket', 'base']],
  faces: [],
};

const context = (joints: RobotJoint[] = []) => {
  const asked: string[][] = [];

  return {
    asked,
    ctx: {
      parts: () => [part('base'), part('link'), part('bracket'), part('ghost', { visible: false })],
      joints: () => joints,
      jointAxes: async (ids: string[]) => {
        asked.push(ids);

        return found;
      },
    },
  };
};

describe('find_joint_axes', () => {
  it('reads every visible solid part and answers in the agent frame', async () => {
    const { asked, ctx } = context();
    const reply = await findJointAxes({}, ctx);

    expect(asked).toEqual([['base', 'link', 'bracket']]);
    expect(reply.data?.candidates[0]).toMatchObject({
      parent: 'base',
      child: 'link',
      axis: [0, -1, 0],
      origin: [0, 0, 48],
    });
    expect(reply.text).toContain('- base → link: axis [0.000,-1.000,0.000] through [0,0,48]');
    expect(reply.text).toContain('Held by two or more pins, so fixed: bracket + base.');
  });

  it('names a candidate that a declared joint already covers', async () => {
    const { ctx } = context([{ id: 'shoulder', parent: ['base'], child: ['link'] } as RobotJoint]);

    expect((await findJointAxes({ ids: ['base', 'link'] }, ctx)).text).toContain('(declared as shoulder)');
  });

  it('refuses parts that are not in the scene', async () => {
    const { asked, ctx } = context();

    expect((await findJointAxes({ ids: ['nope'] }, ctx)).text).toBe('No parts named nope.');
    expect(asked).toEqual([]);
  });
});

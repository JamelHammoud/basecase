import { describe, expect, it } from 'vitest';
import { currentDesign, skillFreshness, type Skill } from '../../src/skills/artifacts';
import { editParts, fixtureRobot, modelOf } from '../../src/skills/fixtureModels';
import { kitEnvironment, kitStatus, type KitEntry } from '../../src/skills/motorKit';
import type { FixtureRobot } from '../../src/sim/fixtures/parts';
import { loadKitSkill } from './plans';

const quad = () => fixtureRobot('quad-servo');

const heavierBody = (robot: FixtureRobot) =>
  editParts(robot, (p) => (p.id === 'body' ? { ...p, massG: (p.massG ?? 0) * 1.3 } : p));

const recoloured = (robot: FixtureRobot) => editParts(robot, (p) => ({ ...p, color: '#d04040' }));

const lessJointed = (robot: FixtureRobot): FixtureRobot => ({
  ...robot,
  joints: robot.joints.filter((j) => j.id !== 'leg3_bend'),
});

function statusOf(options: { design: string; robot: FixtureRobot; skills: Skill[]; entry: KitEntry }) {
  const { design, robot, skills, entry } = options;
  const model = modelOf(robot);
  const row = kitStatus({ design, model, skills }).find((r) => r.entry === entry);
  const single = skills.length === 1 ? skills[0] : null;
  const direct =
    single && skillFreshness(single, currentDesign({ design, model, environment: kitEnvironment(model, entry) }));

  return { row, direct };
}

describe('Kit freshness after CAD edits', () => {
  for (const entry of ['stand', 'velocity-tracking'] as const) {
    it(`${entry}: the Kit environment is a pure function of the model`, () => {
      const { environment } = loadKitSkill('quad-servo', entry);

      expect(kitEnvironment(modelOf(quad()), entry)).toEqual(environment);
    });

    it(`${entry}: a colour edit stays fresh, a mass edit reruns Arena, a topology edit needs training`, () => {
      const { skill } = loadKitSkill('quad-servo', entry);
      const skills = [skill];
      const edits: Array<[FixtureRobot, string]> = [
        [recoloured(quad()), 'fresh'],
        [heavierBody(quad()), 'rerun-arena'],
        [lessJointed(quad()), 'needs-training'],
      ];

      for (const [robot, wanted] of edits) {
        const { row, direct } = statusOf({ design: 'quad-servo', robot, skills, entry });

        expect(row?.freshness).toBe(wanted);
        expect(row?.freshness).toBe(direct);
      }
    });
  }

  it('an entry with no skill shows as missing', () => {
    const rows = kitStatus({ design: 'quad-servo', model: modelOf(quad()), skills: [] });

    expect(rows.map((r) => r.entry)).toEqual(expect.arrayContaining(['stand', 'velocity-tracking']));
    expect(rows.every((r) => r.freshness === 'missing' && r.skill === null)).toBe(true);
  });

  it('a quad-servo skill on the hexapod needs training', () => {
    const { skill } = loadKitSkill('quad-servo', 'stand');
    const { row } = statusOf({ design: 'hexapod', robot: fixtureRobot('hexapod'), skills: [skill], entry: 'stand' });

    expect(row?.freshness).toBe('needs-training');
  });
});

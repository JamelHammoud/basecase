import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, goalsFor } from './caseBuilder';
import type { BuilderRobot } from './caseGoals';
import { castRobot, castSlots, guestsOf } from './caseCast';
import { robotFacts } from './robotFit';
import { caseSlots, type Case } from './schema';
import { slotRefusals } from './slots';
import { caseRobot, parseCase, runCase, touchTheDots } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const builder = (id: string, partner?: string): BuilderRobot => {
  const r = fixture(id);
  const robot = builderRobot(buildRig(r.joints, r.parts), r.parts);

  return partner ? { ...robot, partner: builder(partner) } : robot;
};

function handoff(): Case {
  const built = buildCase({ goal: 'handoff', world: 'floor' }, builder('arm-6dof', 'arm-6dof'));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

const factsOf = (id: string) => {
  const r = fixture(id);

  return robotFacts(buildRig(r.joints, r.parts), r.parts);
};

const namesIn = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag} name="([^"]+)"`, 'g'))].map((m) => m[1]);

describe('Case slots', () => {
  it('reads an old one-slot Case as one slot and writes it back byte for byte', () => {
    const file = JSON.stringify(touchTheDots(fixture('arm-6dof')));
    const kase = parseCase(JSON.parse(file));

    expect(JSON.stringify(kase)).toBe(file);
    expect(caseSlots(kase)).toHaveLength(1);
    expect(caseSlots(kase)[0].id).toBe('robot');
  });

  it('carries up to four named slots, and refuses repeats, a stray slot beside them and unknown names', () => {
    const kase = JSON.parse(JSON.stringify(handoff()));

    expect(parseCase(kase).slots?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(() => parseCase({ ...kase, slots: [kase.slots[0], kase.slots[0]] })).toThrow(/repeats/);
    expect(() => parseCase({ ...kase, slots: Array.from({ length: 5 }, () => kase.slots[0]) })).toThrow();
    expect(() => parseCase({ ...kase, slot: kase.slots[0] })).toThrow(/beside/);
    expect(() => parseCase({ ...kase, reference: { timeline: [{ at: 0, slot: 'c', target: [0, 0, 0] }] } })).toThrow(
      /isn’t a slot/,
    );
  });

  it('compiles two copies of one arm into one model with no name clashes', () => {
    const arm = caseRobot(fixture('arm-6dof'));
    const slots = caseSlots(handoff());
    const guests = guestsOf(slots, [arm]).map((g) => ({ ...g, robot: arm }));
    const team = castRobot(arm, guests);
    const rig = buildRig(team.joints, team.parts);
    const model = buildMjcf({ ...team, rig, project: DEFAULT_PROJECT });
    const cast = castSlots(slots, { rig, parts: team.parts, guests });

    expect(model.robots).toHaveLength(2);
    expect(model.joints).toHaveLength(16);

    for (const tag of ['body', 'joint', 'geom', 'mesh', 'position', 'freejoint']) {
      const names = namesIn(model.xml, tag);

      expect(new Set(names).size).toBe(names.length);
    }

    expect(model.joints.filter((j) => j.id.startsWith('b.')).map((j) => j.name)).toEqual(
      expect.arrayContaining([expect.stringMatching(/_b_arm0$/)]),
    );
    expect(cast.map((c) => c.key)).toEqual(['arm0', 'b.arm0']);
    expect(cast[1].effector?.part).toBe('b.link5');
  });

  it('reports each slot’s misfit on its own', () => {
    const slots = caseSlots(handoff());
    const [arm, rover] = [factsOf('arm-6dof'), factsOf('rover-diff')];

    expect(slotRefusals(slots, [arm, arm])).toEqual([null, null]);
    expect(slotRefusals(slots, [arm, rover])).toEqual([null, expect.stringMatching(/needs an arm/)]);
    expect(slotRefusals(slots, [rover, arm])).toEqual([expect.stringMatching(/needs an arm/), null]);
    expect(slotRefusals(slots, [arm, null])).toEqual([null, expect.stringMatching(/2 robots/)]);
  });

  it('offers Hand Off to a Spot only when a second arm is open', () => {
    expect(goalsFor(builder('arm-6dof')).map((g) => g.kind)).toEqual(['touch', 'pick']);
    expect(goalsFor(builder('arm-6dof', 'rover-diff')).map((g) => g.kind)).toEqual(['touch', 'pick']);
    expect(goalsFor(builder('arm-6dof', 'arm-3dof')).map((g) => g.kind)).toEqual(['touch', 'pick', 'handoff']);
  });
});

describe('a two-slot Case in MuJoCo', () => {
  it('passes Hand Off to a Spot on the fixture arm paired with itself, in real time, and fails with the second arm limp', async () => {
    const mj = await loadMujoco();
    const kase = handoff();
    const arm = fixture('arm-6dof');
    const started = performance.now();
    const reference = await runCase(mj, kase, arm, { controller: 'reference', partners: [arm] });
    const wallSeconds = (performance.now() - started) / 1000;
    const limpPartner = await runCase(mj, kase, arm, { controller: 'reference', partners: [arm], limp: ['b'] });
    const alone = await runCase(mj, kase, arm, { controller: 'reference' });

    expect(reference.refusal).toBeUndefined();
    expect(reference.passed).toBe(true);
    expect(wallSeconds).toBeLessThan(kase.task.seconds);
    expect(limpPartner.passed).toBe(false);
    expect(alone.refusal).toMatch(/2 robots/);
  });
});

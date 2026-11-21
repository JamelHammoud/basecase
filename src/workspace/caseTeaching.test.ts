import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { noRuns } from '../cases/caseRuns';
import { fixtureModel, fixtureRobot } from '../skills/fixtureModels';
import { teachingPolicy } from '../sim/fixtures/teachingPolicy';
import { triesSkill } from '../skills/triesTraining';
import { skillRecord } from '../skills/skillRecords';
import { buildRig } from '../utils/kinematics';
import { caseTeaching, startCaseTeaching } from './caseTeaching';
import { useRoutineSkills, type SceneRoutineSkills } from './useRoutineSkills';
import { DEFAULT_PROJECT } from '../types/robotics';
import { sha256Hex } from '../skills/hash';
import type { Simulation } from '../sim/useSimulation';

it('admits a fresh saved Case policy before the asynchronous skill rows are ready', async () => {
  const robot = fixtureRobot('arm-3dof');
  const rig = buildRig(robot.joints, robot.parts);
  const model = fixtureModel(robot.id);
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(rig, robot.parts));

  if (!made.ok) throw new Error(made.problem);

  const kase = made.kase;
  const prepared = triesSkill({
    model,
    kase,
    design: model.robots[0].key,
    policy: teachingPolicy(model),
    origin: { method: 'ask-for-demo', cost: { wallS: 0, steps: 0 } },
    runs: { ...noRuns(''), runs: 32, passes: 32, refusal: null },
  })!;
  const record = skillRecord(prepared.skill, {
    kit: null,
    environment: prepared.environment,
    case: { id: kase.id, model: sha256Hex(model.xml) },
  });
  const load = vi.fn(async () => prepared.skill);
  let skills: SceneRoutineSkills | undefined;

  function Harness() {
    skills = useRoutineSkills({
      rows: [],
      load,
      project: { ...DEFAULT_PROJECT, skills: [record] },
      setProject: vi.fn(),
    });

    return null;
  }

  renderToString(createElement(Harness));

  const selected = await caseTeaching({ model, kase, rig, parts: robot.parts, skills });

  expect(selected.skill).toBe(record.hash);
  expect(selected.controller).toEqual(prepared.skill.controller);
  expect(load).toHaveBeenCalledOnce();
  expect(await skills!.own()).toEqual([]);
  await expect(
    caseTeaching({ model, kase: { ...kase, id: 'other-case' }, rig, parts: robot.parts, skills }),
  ).rejects.toThrow('Train a policy');
});

it.each([false, true])(
  'reports a source refusal only while teaching startup is current, cancelled=%s',
  async (cancelled) => {
    const robot = fixtureRobot('arm-3dof');
    const rig = buildRig(robot.joints, robot.parts);
    const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(rig, robot.parts));

    if (!made.ok) throw new Error(made.problem);

    const start = vi.fn();
    let current = true;
    const pending = startCaseTeaching({
      scene: {
        model: fixtureModel(robot.id),
        kase: made.kase,
        rig,
        parts: robot.parts,
        skills: {
          own: async () => {
            current = !cancelled;

            return [];
          },
          handoffs: () => undefined,
        },
      },
      sim: { teaching: { start } } as unknown as Simulation,
      current: () => current,
      logic: { plan: null, kit: null },
      joints: robot.joints,
    });

    if (cancelled) await expect(pending).resolves.toBeNull();
    else await expect(pending).rejects.toThrow('Train a policy');

    expect(start).not.toHaveBeenCalled();
  },
);

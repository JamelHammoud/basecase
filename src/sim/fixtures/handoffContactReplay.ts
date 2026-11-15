import type { MainModule } from '@mujoco/mujoco';
import { buildCase, builderRobot } from '../../cases/caseBuilder';
import { castRobot, castSlots, guestsOf } from '../../cases/caseCast';
import { caseSlots, type Case, type ReferenceCommand } from '../../cases/schema';
import { caseRobot, runCase } from '../../cases/testing';
import { buildRig } from '../../utils/kinematics';
import { captureContactReplay } from './contactReplay';
import { fixtureRobots } from './robots';

function closeAt(kase: Case, slot: string) {
  return kase.reference.timeline.find((command) => command.slot === slot && command.aux?.[1] === 1)!.at;
}

function releaseAt(kase: Case, slot: string) {
  return kase.reference.timeline.find(
    (command) => command.slot === slot && command.at > closeAt(kase, slot) && command.aux?.[1] === 0,
  )!.at;
}

function faultyCommand(kase: Case, fault: string, command: ReferenceCommand): ReferenceCommand {
  const donorRelease = releaseAt(kase, 'a');
  const recipientRelease = releaseAt(kase, 'b');
  const earlyDrop = (donorRelease + recipientRelease) / 2;

  if (fault === 'open' && command.slot === 'b') return { ...command, aux: [0, 0] };

  if (fault === 'never' && command.slot === 'a' && command.at >= donorRelease) return { ...command, aux: [0, 1] };

  if (fault === 'early' && command.slot === 'a' && command.at === donorRelease)
    return { ...command, at: closeAt(kase, 'b') - 0.5 };

  if (fault === 'drop' && command.slot === 'b' && command.at === recipientRelease) return { ...command, at: earlyDrop };

  if (fault === 'drop' && command.slot === 'b' && command.at > earlyDrop) return { ...command, aux: [0, 0] };

  return command;
}

export async function handoffContactReplays(mj: MainModule) {
  const robot = fixtureRobots().find((fixture) => fixture.id === 'arm-6dof')!;
  const builder = builderRobot(buildRig(robot.joints, robot.parts), robot.parts);
  const made = buildCase({ goal: 'handoff', world: 'floor' }, { ...builder, partner: builder });

  if (!made.ok) throw new Error(made.problem);

  const replays = [];

  for (const fault of ['nominal', 'limp', 'open', 'early', 'never', 'drop']) {
    const kase = {
      ...made.kase,
      reference: { timeline: made.kase.reference.timeline.map((command) => faultyCommand(made.kase, fault, command)) },
    };
    const capture = captureContactReplay(mj);
    const result = await runCase(capture.module, kase, robot, {
      controller: 'reference',
      partners: [robot],
      record: true,
      ...(fault === 'limp' ? { limp: ['b'] } : {}),
    });

    if (result.passed !== (fault === 'nominal')) throw new Error(`Handoff ${fault} has an unexpected verdict.`);

    const slots = caseSlots(result.case);
    const guests = guestsOf(slots, [caseRobot(robot)]).map((guest) => ({ ...guest, robot: caseRobot(robot) }));
    const team = castRobot(caseRobot(robot), guests);
    const rig = buildRig(team.joints, team.parts);
    const cast = castSlots(slots, { rig, parts: team.parts, guests });

    replays.push({
      ...capture.finish(`handoff-${fault}`, result.model),
      wasmPassed: result.passed,
      wasmMargin: result.margin,
      kase: result.case,
      model: result.model,
      parts: team.parts,
      joints: team.joints,
      effector: cast[0].effector,
      effectors: Object.fromEntries(cast.map((slot) => [slot.id, slot.effector])),
    });
  }

  return replays;
}

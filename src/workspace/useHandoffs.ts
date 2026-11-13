import { type RefObject, useState } from 'react';
import type { CompileResult } from '../routines/compile';
import { handoffKey, notOnBody, refusedHandoffs, type HandoffProofs } from '../routines/handoffs';
import { scriptedDrive } from '../routines/physicsDrive';
import { PROOF_SEEDS } from '../routines/physicsProver';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Handoff, TransitionProof } from '../routines/schema';
import { pairStamp } from '../routines/skillStamps';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import { modelHashes, type Skill } from '../skills/artifacts';
import { errorMessage } from '../utils/errorMessage';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { stubbedPorts, type HandoffPorts, type HandoffStub } from './handoffStub';
import { sceneSkills, type OwnSkill, type RoutineSkills } from './routineCheck';
import type { ShowToast } from './types';
import type { HandoffJob, HandoffTraining, SceneRoutineSkills } from './useRoutineSkills';

interface HandoffsInput {
  skills: SceneRoutineSkills;
  train: (job: HandoffJob) => Promise<HandoffTraining | null>;
  scene: RefObject<{ parts: ScenePart[]; joints: RobotJoint[] }>;
  buildModel: () => Promise<SimModel>;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
}

type Trained = { skill: Skill; proof: TransitionProof; target: OwnSkill } | { reason: string };

export function useHandoffs(input: HandoffsInput) {
  const [busy, setBusy] = useState<string | null>(null);
  const [stub, setStub] = useState<HandoffPorts | null>(null);
  const skills = stub?.skills ?? input.skills;

  const store = (pair: Handoff, proof: TransitionProof) =>
    input.updateProjectNow((p) => ({ ...p, handoffs: { ...p.handoffs, [handoffKey(pair)]: proof } }));

  const during = async (node: string, work: () => Promise<void>) => {
    setBusy(node);

    try {
      await work();
    } finally {
      setBusy(null);
    }
  };

  const setup = async () => {
    const model = await input.buildModel();
    const { joints, parts } = input.scene.current;

    return { model, joints, drive: scriptedDrive(model, joints, parts) };
  };

  const stamped = async (pair: Handoff, drive: DriveSetup | null) =>
    pairStamp({ skills: await sceneSkills(await skills.own()), drive }, pair);

  const proved = async (pair: Handoff): Promise<TransitionProof | null> => {
    const scene = await setup();

    if (stub) return { ...stub.prove(modelHashes(scene.model).physics), skills: await stamped(pair, scene.drive) };

    const all = await sceneSkills(await skills.own());

    return (await inRoutinesWorker({ type: 'prove', ...scene, skills: all, pair })).proof;
  };

  const trained = async (pair: Handoff): Promise<Trained | null> => {
    const scene = await setup();

    if (stub) {
      const done = await stub.train(pair.to, modelHashes(scene.model).physics);

      return done && { ...done, proof: { ...done.proof, skills: await stamped(pair, scene.drive) } };
    }

    const found = await input.train({ pair, ...scene });

    if (!found) return null;

    const { skill, proof, reason } = found.result;

    return skill && proof ? { skill, proof, target: found.target } : { reason };
  };

  const proveQuietly = async (pair: Handoff, node: string): Promise<TransitionProof | null> => {
    const found: { proof: TransitionProof | null } = { proof: null };

    await during(node, async () => {
      found.proof = await proved(pair);

      if (found.proof) store(pair, found.proof);
    });

    return found.proof;
  };

  const prove = async (pair: Handoff, node: string) => {
    const proof = await proveQuietly(pair, node).catch((error: unknown) => {
      input.showToast(errorMessage(error));

      return undefined;
    });

    if (proof === null) input.showToast(notOnBody(pair));
  };

  const proveRefused = async (compile: (skillsFor: RoutineSkills) => Promise<CompileResult>) => {
    const first = await compile(skills);
    const unproven = first.ok ? [] : refusedHandoffs(first.errors).filter((h) => h.falls === null);

    if (!unproven.length) return first;

    const fresh: HandoffProofs = {};

    for (const pair of unproven) {
      const proof = await proveQuietly(pair, pair.node ?? '');

      if (proof) fresh[handoffKey(pair)] = proof;
    }

    return compile({ ...skills, handoffs: () => ({ ...skills.handoffs(), ...fresh }) });
  };

  const train = (pair: Handoff, node: string) =>
    during(node, async () => {
      const done = await trained(pair).catch((error: unknown) => ({ reason: errorMessage(error) }));

      if (!done) return;

      if ('reason' in done) {
        input.showToast(done.reason);

        return;
      }

      skills.replace(done.target, done.skill);
      store(pair, done.proof);
    });

  const plant = async (pair: Handoff, falls: number) => {
    const scene = await setup();
    const stamp = await stamped(pair, scene.drive);

    store(pair, { seeds: PROOF_SEEDS, falls, modelHash: modelHashes(scene.model).physics, skills: stamp });
  };

  return {
    busy,
    skills,
    prove,
    proveRefused,
    train,
    plant,
    stub: (next: HandoffStub) => setStub(stubbedPorts(next, input.skills)),
  };
}

export type Handoffs = ReturnType<typeof useHandoffs>;

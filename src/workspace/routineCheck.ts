import type { Skill } from '../skills/artifacts';
import type { SkillRecord } from '../skills/skillRecords';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sceneCapabilities } from '../routines/capabilities';
import { compileCaseLogic } from '../cases/caseLogic';
import { compileRoutine, type CompileResult } from '../routines/compile';
import { withHandoffs, type HandoffProofs } from '../routines/handoffs';
import { loadKitLibrary } from '../routines/kitLibrary';
import type { RoutineKit } from '../routines/physicsKit';
import { scriptedDrive } from '../routines/physicsDrive';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Routine, SkillContract } from '../routines/schema';
import { skillId } from '../routines/skillNames';
import { physicsStamp } from '../routines/skillStamps';
import { hashOf } from '../skills/hash';

export interface OwnSkill {
  hash: string;
  skill: Skill;
  record: SkillRecord | null;
}

export interface RoutineSkills {
  own: () => Promise<OwnSkill[]>;
  handoffs: () => HandoffProofs | undefined;
  kit?: readonly SkillContract[];
}

export const NO_ROUTINE_SKILLS: RoutineSkills = { own: () => Promise.resolve([]), handoffs: () => undefined };

const kits = new Map<string, Promise<RoutineKit>>();

export const ownId = (own: OwnSkill) => skillId(own.skill.name);

export async function sceneSkills(own: readonly OwnSkill[]): Promise<Skill[]> {
  return [...(await loadKitLibrary()), ...own.map((o) => o.skill)];
}

export async function sceneKit(
  model: SimModel,
  scene: { joints: RobotJoint[]; parts: ScenePart[]; own?: readonly OwnSkill[] },
): Promise<RoutineKit> {
  const { joints, parts } = scene;
  const own = scene.own ?? [];
  const drive = scriptedDrive(model, joints, parts);
  const key = `${physicsStamp(model)}#${hashOf(drive)}#${own.map((o) => o.hash).join(',')}`;
  const known = kits.get(key);

  if (known) return known;

  const made = sceneSkills(own)
    .then((skills) => inRoutinesWorker({ type: 'kit', model, joints, skills, drive }))
    .then((reply) => reply.kit);

  kits.set(key, made);
  made.catch(() => kits.delete(key));

  return made;
}

export interface SceneCheck {
  compiled: CompileResult;
  kit: RoutineKit;
  own: OwnSkill[];
}

export interface RoutineScene {
  parts: ScenePart[];
  joints: RobotJoint[];
  buildModel: () => Promise<SimModel>;
  skills?: RoutineSkills;
}

export async function checkRoutine(
  options: RoutineScene & { routine: unknown; caseLogic?: boolean },
): Promise<SceneCheck> {
  const { routine, parts, joints } = options;
  const skills = options.skills ?? NO_ROUTINE_SKILLS;
  const [model, own] = await Promise.all([options.buildModel(), skills.own()]);
  const kit = skills.kit
    ? {
        skills: skills.kit.map((skill) => ({
          ...skill,
          transitions: Object.fromEntries(
            Object.entries(skill.transitions).map(([to, proof]) => [to, { ...proof, modelHash: physicsStamp(model) }]),
          ),
        })),
        modelHash: physicsStamp(model),
        policies: await sceneSkills(own),
        drive: scriptedDrive(model, joints, parts),
        problems: {},
      }
    : await sceneKit(model, { joints, parts, own });
  const scene = {
    skills: withHandoffs(kit, skills.handoffs()),
    modelHash: kit.modelHash,
    capabilities: sceneCapabilities({ parts, joints }),
  };
  const compiled = options.caseLogic ? compileCaseLogic(routine as Routine, scene) : compileRoutine(routine, scene);

  return { compiled, kit, own };
}

export async function checkLogic(logic: unknown, scene: RoutineScene) {
  return (await checkRoutine({ ...scene, routine: logic, caseLogic: true })).compiled;
}

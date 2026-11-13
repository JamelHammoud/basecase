import { modelHashes } from '../skills/artifacts';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sceneCapabilities } from '../routines/capabilities';
import { compileCaseLogic } from '../cases/caseLogic';
import { compileRoutine, type CompileResult } from '../routines/compile';
import { loadKitLibrary } from '../routines/kitLibrary';
import type { RoutineKit } from '../routines/physicsKit';
import { scriptedDrive } from '../routines/physicsDrive';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Routine } from '../routines/schema';

const kits = new Map<string, Promise<RoutineKit>>();

export async function sceneKit(model: SimModel, joints: RobotJoint[], parts: ScenePart[]): Promise<RoutineKit> {
  const drive = scriptedDrive(model, joints, parts);
  const key = `${modelHashes(model).physics}#${drive?.kind ?? ''}`;
  const known = kits.get(key);

  if (known) return known;

  const made = loadKitLibrary()
    .then((skills) => inRoutinesWorker({ type: 'kit', model, joints, skills, drive }))
    .then((reply) => reply.kit);

  kits.set(key, made);
  made.catch(() => kits.delete(key));

  return made;
}

export interface SceneCheck {
  compiled: CompileResult;
  kit: RoutineKit;
}

export async function checkRoutine(options: {
  routine: unknown;
  parts: ScenePart[];
  joints: RobotJoint[];
  buildModel: () => Promise<SimModel>;
  caseLogic?: boolean;
}): Promise<SceneCheck> {
  const { routine, parts, joints } = options;
  const kit = await sceneKit(await options.buildModel(), joints, parts);
  const scene = { skills: kit.skills, modelHash: kit.modelHash, capabilities: sceneCapabilities({ parts, joints }) };
  const compiled = options.caseLogic ? compileCaseLogic(routine as Routine, scene) : compileRoutine(routine, scene);

  return { compiled, kit };
}

export async function checkLogic(logic: unknown, scene: Omit<Parameters<typeof checkRoutine>[0], 'routine'>) {
  return (await checkRoutine({ ...scene, routine: logic, caseLogic: true })).compiled;
}

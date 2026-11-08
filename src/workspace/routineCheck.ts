import { modelHashes } from '../skills/artifacts';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sceneCapabilities } from '../routines/capabilities';
import { compileRoutine, type CompileResult } from '../routines/compile';
import { loadKitLibrary } from '../routines/kitLibrary';
import type { RoutineKit } from '../routines/physicsKit';
import { scriptedDrive } from '../routines/physicsDrive';
import { inRoutinesWorker } from '../routines/routinesClient';

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
}): Promise<SceneCheck> {
  const { routine, parts, joints } = options;
  const kit = await sceneKit(await options.buildModel(), joints, parts);
  const compiled = compileRoutine(routine, {
    skills: kit.skills,
    modelHash: kit.modelHash,
    capabilities: sceneCapabilities({ parts, joints }),
  });

  return { compiled, kit };
}

import { buildRig } from '../utils/kinematics';
import { robotFacts } from '../cases/robotFit';
import { selectedPickProblem, selectedPickSpan } from '../cases/selectedPick';
import { builderRobot } from '../cases/caseBuilder';
import type { RenderedCad } from '../utils/platform/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { DesignParameter } from '../utils/designParameters/types';
import { assembleFingers, type FingerAssemblyJob } from './assembly';
import { DEFAULT_FINGER, fingerCode } from './cad';
import { assertFingerDimensions, readMount } from './dimensions';
import { fingerObstacles } from './validation';
import { resolveParameters } from '../utils/designParameters/resolve';

export interface GenerateFingersInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  parameters?: DesignParameter[];
  target: string;
  style: 'flat' | 'v';
}

interface Services {
  compile: (code: string) => Promise<RenderedCad>;
  current: () => boolean;
  signal?: AbortSignal;
  assemble?: (job: FingerAssemblyJob) => Promise<ReturnType<typeof assembleFingers>>;
}

function assertCurrent(services: Services) {
  services.signal?.throwIfAborted();

  if (!services.current()) throw new Error('The design changed during finger preparation.');
}

function mountingPair(input: GenerateFingersInput) {
  const rig = buildRig(input.joints, input.parts);
  const gripper = robotFacts(rig, input.parts).gripper;
  const target = input.parts.find((part) => part.id === input.target);

  if (!gripper || !target || input.parts.length > 256)
    throw new Error('Select a supported gripper and one rigid object.');

  const problem = selectedPickProblem(target, builderRobot(rig, input.parts));

  if (problem) throw new Error(problem);

  const mounts = gripper.jaws.map((jaw) => {
    const candidates = input.parts.filter((part) => rig.ownerOf.get(part.id) === jaw.joint && readMount(part));

    if (candidates.length !== 1) throw new Error('Use the declared two-M3 outboard finger mounting interface.');

    return { part: candidates[0].id, joint: jaw.joint, dimensions: readMount(candidates[0])! };
  });

  if (JSON.stringify(mounts[0].dimensions) !== JSON.stringify(mounts[1].dimensions))
    throw new Error('Use matching mounting dimensions on both jaws.');

  return mounts;
}

export async function generateFingers(input: GenerateFingersInput, services: Services) {
  assertCurrent(services);

  const started = performance.now();
  const mounts = mountingPair(input);
  const target = input.parts.find((part) => part.id === input.target)!;
  const current = resolveParameters(input.parameters ?? []);
  const refitting = input.parts.some(
    (part) => part.gripperFinger && mounts.some((mount) => mount.part === part.gripperFinger!.mount),
  );
  const value = (name: string, fallback: number) => (refitting ? (current.get(name)?.value ?? fallback) : fallback);
  const dimensions = {
    ...DEFAULT_FINGER,
    ...mounts[0].dimensions,
    length: value('finger_length', Math.max(12, Math.ceil(selectedPickSpan(target, [0, 1, 0]) + 4))),
    thickness: value('finger_thickness', DEFAULT_FINGER.thickness),
    clearance: value('finger_clearance', DEFAULT_FINGER.clearance),
    v: input.style === 'v' ? 1 : 0,
  };
  const declarations: DesignParameter[] = [
    { name: 'finger_length', value: dimensions.length, unit: 'mm' },
    { name: 'finger_thickness', value: dimensions.thickness, unit: 'mm' },
    { name: 'finger_clearance', value: dimensions.clearance, unit: 'mm' },
    { name: 'finger_mount_height', value: dimensions.height, unit: 'mm' },
    { name: 'finger_mount_depth', value: dimensions.depth, unit: 'mm' },
    { name: 'finger_mount_spacing', value: dimensions.spacing, unit: 'mm' },
  ];

  if (!refitting && input.parameters?.some((parameter) => declarations.some((item) => item.name === parameter.name)))
    throw new Error('Rename the existing finger parameters before making a pair.');

  assertFingerDimensions(dimensions);

  const code = fingerCode(dimensions);
  const rendered = await services.compile(code);

  assertCurrent(services);

  if (!rendered.ok || !rendered.positions?.length || !rendered.indices?.length)
    throw new Error(rendered.error || 'The CAD kernel returned no finger geometry.');

  const job: FingerAssemblyJob = {
    parts: fingerObstacles(input.parts, [input.target]),
    joints: input.joints,
    target: input.target,
    mounts,
    dimensions,
    cad: {
      language: 'openscad',
      code,
      positions: rendered.positions,
      indices: rendered.indices,
      stats: rendered.stats,
    },
    parameters: [
      ...(input.parameters ?? []),
      ...declarations.filter(
        (declaration) => !input.parameters?.some((parameter) => parameter.name === declaration.name),
      ),
    ],
  };
  const result = await (services.assemble?.(job) ?? assembleFingers(job));

  assertCurrent(services);

  const generated = new Map(result.parts.map((part) => [part.id, part]));
  const own = (part: ScenePart) =>
    !!part.gripperFinger && mounts.some((mount) => mount.part === part.gripperFinger!.mount);
  const parts = input.parts
    .filter((part) => !own(part))
    .map((part) => (mounts.some((mount) => mount.part === part.id) ? generated.get(part.id)! : part));

  parts.push(...result.parts.filter(own));

  return {
    ...result,
    parts,
    metrics: { preparationMs: performance.now() - started, triangles: rendered.indices.length / 3 },
  };
}

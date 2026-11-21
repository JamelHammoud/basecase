import type { CustomModelDefinition, RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, resolveJoints, type V3 } from '../utils/kinematics';
import { modelToParts } from '../utils/libraryParts';
import { jointPartIds } from '../utils/libraryJoints';
import { Euler, Matrix4, Vector3 } from 'three';
import { sceneModel } from '../workspace/libraryModels';
import { readFixtureGeometry, fixtureMass } from './fixtureGeometry';
import { readWorldObjects, type WorldObject } from './schema';

interface CaptureFixture {
  parts: ScenePart[];
  joints: RobotJoint[];
  name: string;
  screenshot?: () => Promise<string> | undefined;
}

function selectedJoints({ parts, joints }: CaptureFixture): RobotJoint[] {
  const ids = new Set(parts.map((part) => part.id));
  const selected = joints.filter((joint) => [...joint.parent, ...joint.child].some((id) => ids.has(id)));

  if (!parts.length || !selected.some((joint) => joint.type !== 'fixed'))
    throw new Error('Select an assembly with a hinge or slider.');

  if (selected.some((joint) => jointPartIds(joint).some((id) => !ids.has(id))))
    throw new Error('Select every part connected to the assembly’s joints.');

  if (
    selected.some(
      (joint) => joint.loop || joint.actuators?.length || (joint.type !== 'fixed' && joint.actuation !== 'passive'),
    )
  )
    throw new Error('Make the assembly’s joints passive before saving a fixture.');

  if (selected.some((joint) => joint.type !== 'fixed' && !joint.range))
    throw new Error('Set joint limits before saving a fixture.');

  return selected;
}

export function canCaptureCaseFixture(parts: ScenePart[], joints: RobotJoint[]): boolean {
  try {
    selectedJoints({ parts, joints, name: '' });

    return true;
  } catch {
    return false;
  }
}

export async function captureCaseFixture(input: CaptureFixture): Promise<CustomModelDefinition> {
  const joints = selectedJoints(input);

  input.parts.forEach((part) => readFixtureGeometry(part, part.id));

  const model = await sceneModel({
    sourceParts: input.parts,
    joints,
    single: null,
    sceneName: input.name,
    screenshot: input.screenshot ?? (() => undefined),
  });

  placeCaseFixture(model, { position: [0, 0, 0] });

  return { ...model, caseFixture: true };
}

interface FixturePlacement {
  position: V3;
  size?: V3;
}

function scaledPart(part: ScenePart, scale: V3, position: V3): ScenePart {
  const placed = { ...part, position: part.position.map((v, i) => v * scale[i] + position[i]) as V3 };

  if (scale.every((value) => value === 1)) return placed;

  const rotation = new Matrix4().makeRotationFromEuler(
    new Euler(...(part.rotation.map((v) => (v * Math.PI) / 180) as V3)),
  );
  const values = rotation.elements;
  const cardinal = [0, 1, 2, 4, 5, 6, 8, 9, 10].every(
    (i) => Math.abs(values[i]) < 1e-8 || Math.abs(Math.abs(values[i]) - 1) < 1e-8,
  );

  if (cardinal && !part.sheetTransform) {
    const local = [0, 1, 2].map((i) => [0, 1, 2].reduce((sum, j) => sum + Math.abs(values[i * 4 + j]) * scale[j], 0));

    return {
      ...placed,
      dimensions: {
        ...part.dimensions,
        width: part.dimensions.width * local[0],
        height: part.dimensions.height * local[1],
        depth: part.dimensions.depth * local[2],
      },
    };
  }

  const affine = rotation
    .clone()
    .invert()
    .multiply(new Matrix4().makeScale(...scale))
    .multiply(rotation)
    .multiply(part.sheetTransform ? new Matrix4().fromArray(part.sheetTransform) : new Matrix4());

  return { ...placed, sheetTransform: affine.toArray() };
}

function passiveOf(joint: RobotJoint | undefined, representative: boolean): Pick<WorldObject, 'joint'> {
  if (!joint || !representative || joint.type === 'fixed') return {};

  return {
    joint: {
      type: joint.type,
      origin: joint.origin,
      axis: joint.axis,
      range: joint.range!,
      damping: joint.damping ?? 0,
      frictionloss: joint.frictionloss ?? 0,
      ...(joint.stiffness === undefined ? {} : { stiffness: joint.stiffness }),
      ...(joint.springref === undefined ? {} : { springref: joint.springref }),
    },
  };
}

function fixtureTree(parts: ScenePart[], joints: RobotJoint[]): WorldObject[] {
  const resolved = resolveJoints(joints, parts);
  const rig = buildRig(resolved, parts);
  const roots = new Map(
    resolved.map((joint) => [joint.id, joint.child.find((id) => rig.ownerOf.get(id) === joint.id)]),
  );
  const base = parts.find((part) => !rig.ownerOf.has(part.id))?.id;

  return parts.map((part): WorldObject => {
    const owner = rig.ownerOf.get(part.id);
    const joint = owner ? rig.byId.get(owner) : undefined;
    const representative = joint ? roots.get(joint.id) : undefined;
    const parentJoint = joint ? rig.parentOf.get(joint.id) : undefined;
    const above = parentJoint ? roots.get(parentJoint) : base;
    const parent = representative === part.id ? above : (representative ?? base);

    return {
      id: part.id,
      name: part.name,
      kind: 'custom_model',
      geometry: part,
      position: part.position,
      rotation: part.rotation,
      size: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
      color: part.color,
      behavior: joint || parent !== part.id ? 'dynamic' : 'static',
      massG: fixtureMass(part),
      massSource: part.massG === undefined ? 'estimated' : 'supplied',
      friction: part.physics?.friction ?? 0.8,
      ...(parent && parent !== part.id ? { parent } : {}),
      ...passiveOf(joint, representative === part.id),
    };
  });
}

export function fixtureSource(model: CustomModelDefinition) {
  const parts = model.nodes.map((node): ScenePart => ({
    ...node.part!,
    id: node.id,
    position: node.position,
    rotation: node.rotation,
    dimensions: node.dimensions,
  }));
  const rig = buildRig(resolveJoints(model.joints ?? [], parts), parts);
  const joint = rig.joints.find((item) => item.type !== 'fixed');
  const id = joint?.child.find((child) => rig.ownerOf.get(child) === joint.id);
  const part = parts.find((item) => item.id === id);

  return { parts, joint, part };
}

export function placeCaseFixture(model: CustomModelDefinition, placement: FixturePlacement): WorldObject[] {
  let next = 0;
  let nextJoint = 0;
  const restored = modelToParts(model, [0, 0, 0], (prefix) => {
    if (prefix === 'group') return 'fixture-group';

    return prefix === 'joint' ? `fixture-joint-${nextJoint++}` : `fixture-${next++}`;
  });

  selectedJoints({ parts: restored.parts, joints: restored.joints, name: model.name });

  const size = model.defaultDimensions;
  const original: V3 = [size.width, size.height, size.depth];
  const scale = original.map((v, i) => (placement.size ? placement.size[i] / v : 1)) as V3;
  const parts = restored.parts.map((part) => scaledPart(part, scale, placement.position));
  const joints = resolveJoints(restored.joints, restored.parts).map((joint) => {
    const axis = new Vector3(...joint.axis).multiply(new Vector3(...scale));
    const factor = joint.type === 'prismatic' ? axis.length() : 1;

    return {
      ...joint,
      frame: undefined,
      axis: axis.normalize().toArray() as V3,
      origin: joint.origin.map((v, i) => v * scale[i] + placement.position[i]) as V3,
      range: joint.range?.map((value) => value * factor) as RobotJoint['range'],
      ...(joint.springref === undefined ? {} : { springref: joint.springref * factor }),
    };
  });

  const objects = fixtureTree(parts, joints);

  if (objects.filter((object) => object.joint).length !== joints.filter((joint) => joint.type !== 'fixed').length)
    throw new Error('Bind every moving joint to its own parts before saving a fixture.');

  return readWorldObjects(objects);
}

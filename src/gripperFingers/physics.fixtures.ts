import type { FixtureRobot } from '../sim/fixtures/parts';
import { rotationDegrees } from './frames';
import { Euler, Quaternion, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import { partSoup } from '../utils/sketch/fixtures/supportDesigns';
import { measureTriangles } from '../three/meshMeasure';
import { partMatrix, type V3 } from '../utils/kinematics';

export function fingerPhysics(parts: ScenePart[]) {
  const triangles = Object.fromEntries(parts.map((part) => [part.id, partSoup(part)]));
  const measures = Object.fromEntries(
    parts.map((part) => {
      const measure = measureTriangles(triangles[part.id]);

      measure.centroid = new Vector3(...measure.centroid).applyMatrix4(partMatrix(part)).toArray() as V3;

      return [part.id, measure];
    }),
  );

  return { measures, partTriangles: (id: string) => triangles[id] ?? null };
}

export function fingerTargetFixture(source: FixtureRobot, target: ScenePart, yaw: number) {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (yaw * Math.PI) / 180);
  const point = (v: V3): V3 => new Vector3(...v).applyQuaternion(rotation).toArray() as V3;
  const part = (p: ScenePart): ScenePart => ({
    ...p,
    position: point(p.position),
    rotation: rotationDegrees(
      rotation
        .clone()
        .multiply(new Quaternion().setFromEuler(new Euler(...p.rotation.map((value) => (value * Math.PI) / 180)))),
    ),
  });

  return {
    ...source,
    parts: [...source.parts.map(part), part(target)],
    joints: source.joints.map((joint) => ({ ...joint, origin: point(joint.origin), axis: point(joint.axis) })),
    target: part(target),
  };
}

export function embeddedTargetParts(parts: ScenePart[], targetId: string): ScenePart[] {
  const palm = parts.find((part) => part.id === 'palm')!;

  return parts.map((part) =>
    part.id === targetId ? { ...part, position: palm.position, physics: { ...part.physics, dynamic: false } } : part,
  );
}

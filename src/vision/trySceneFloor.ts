import { floorIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { buildPartGroup } from '../three/buildPartMesh';
import type { RobotPoseState, ScenePart } from '../types/robotics';
import { poseDeltas, type Rig } from '../utils/kinematics';

export function trySceneFloor(parts: ScenePart[], rig: Rig, pose: RobotPoseState | undefined) {
  const deltas = poseDeltas(
    rig,
    pose,
    parts.map((part) => part.id),
  );
  const objects = parts
    .filter((part) => part.role === 'solid' && part.kind !== 'image_plane')
    .map((part) => {
      const object = buildPartGroup(part, false, { shareGeometry: true, lateEdges: true });
      const delta = deltas.get(part.id);

      if (delta) object.applyMatrix4(delta);

      return { id: part.id, object };
    });

  return floorIn(snapshotShapes(objects));
}

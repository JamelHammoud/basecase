import type { DatasetCamera } from '../datasets/cameras';
import type { RobotStatus } from '../robot/robotState';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { FixedCamera } from './fixed';
import { silhouetteDrawer, type JointDegrees, type Silhouette } from './silhouette';
import { cameraViews, stripParts } from './views';

export interface SilhouetteSource {
  view: DatasetCamera;
  frame: () => Promise<Silhouette | null>;
}

export const calibrationView = (parts: readonly ScenePart[], fixed: FixedCamera[] = []): DatasetCamera =>
  cameraViews(stripParts([...parts]), [], fixed)[0];

export interface EmulatedCameraInput {
  parts: readonly ScenePart[];
  joints: readonly RobotJoint[];
  view: DatasetCamera;
  connected: { ids: readonly number[]; joints: readonly string[] };
  status: () => RobotStatus | null;
}

function trueDegrees(status: RobotStatus | null, connected: EmulatedCameraInput['connected']): JointDegrees | null {
  const degrees: JointDegrees = {};

  for (const [k, id] of connected.ids.entries()) {
    const linkRad = status?.joints.find((j) => j.id === id)?.link_rad;

    if (typeof linkRad !== 'number') return null;

    degrees[connected.joints[k]] = (linkRad * 180) / Math.PI;
  }

  return degrees;
}

export function emulatedCamera({ parts, joints, view, connected, status }: EmulatedCameraInput): SilhouetteSource {
  const draw = silhouetteDrawer({ parts, joints, view });

  return {
    view,
    frame: async () => {
      const degrees = trueDegrees(status(), connected);

      return degrees && draw(degrees);
    },
  };
}

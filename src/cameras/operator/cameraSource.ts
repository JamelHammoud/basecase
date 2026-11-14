import type { InputRobot, InputSource } from '../../sim/inputTypes';
import {
  handGrip,
  joinOperatorCamera,
  latestFaceFollow,
  latestFollow,
  latestHandFollow,
  latestMarks,
  leaveOperatorCamera,
  type LandmarkKind,
} from './operatorCamera';

const lifecycle = (kind: LandmarkKind): Pick<InputSource, 'open' | 'close' | 'raw'> => ({
  open: (robot: InputRobot | null) => (robot ? joinOperatorCamera(kind, robot) : Promise.resolve(null)),
  close: () => leaveOperatorCamera(kind),
  raw: () => latestMarks(kind),
});

export const cameraInputSource: InputSource = {
  id: 'camera',
  pose: true,
  read: ({ keys }) => {
    const follow = latestFollow();

    if (!follow) return null;

    return {
      v: keys.v,
      ...(follow.joints ? { joints: follow.joints } : {}),
      ...(follow.target ? { target: follow.target } : {}),
      aux: [0, handGrip() ?? follow.grip],
    };
  },
  ...lifecycle('body'),
};

export const handInputSource: InputSource = {
  id: 'hand',
  pose: true,
  read: ({ keys }) => {
    const follow = latestHandFollow();

    return follow?.target ? { v: keys.v, target: follow.target, aux: [0, follow.grip] } : null;
  },
  ...lifecycle('hand'),
};

export const faceInputSource: InputSource = {
  id: 'face',
  pose: true,
  read: ({ keys }) => {
    const follow = latestFaceFollow();

    return follow?.joints ? { v: keys.v, joints: follow.joints } : null;
  },
  ...lifecycle('face'),
};

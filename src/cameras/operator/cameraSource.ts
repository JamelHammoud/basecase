import type { InputSource } from '../../sim/inputTypes';
import { closeOperatorCamera, latestFollow, openOperatorCamera } from './operatorCamera';

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
      aux: [0, follow.grip],
    };
  },
  open: openOperatorCamera,
  close: closeOperatorCamera,
};

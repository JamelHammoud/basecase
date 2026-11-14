import { streamCost } from '../../../cameras/liveFeed';
import {
  feedOperatorFace,
  feedOperatorHand,
  feedOperatorPose,
  type FaceSample,
  type HandSample,
  operatorCameraSnapshot,
  operatorFeeding,
  operatorLatency,
  operatorTrackState,
} from '../../../cameras/operator/operatorCamera';
import type { PoseSample } from '../../../cameras/operator/poseFollow';
import { phoneSnapshot } from '../../../phone/phoneStore';

function operatorCameraState() {
  const { open, label, estimator, error } = operatorCameraSnapshot();
  const track = operatorTrackState();

  return {
    open,
    live: open && track === 'live',
    ended: track === 'ended',
    label,
    estimator,
    error,
    latency: operatorLatency(),
    feeding: operatorFeeding(),
  };
}

export default function camerasStudio() {
  return {
    feedPose: (samples: PoseSample[], fps?: number) => feedOperatorPose(samples, fps),
    feedHand: (samples: HandSample[], fps?: number) => feedOperatorHand(samples, fps),
    feedFace: (samples: FaceSample[], fps?: number) => feedOperatorFace(samples, fps),
    operatorCamera: () => operatorCameraState(),
    cameraStreams: () => ({ ...streamCost }),
    phone: () => phoneSnapshot(),
  };
}

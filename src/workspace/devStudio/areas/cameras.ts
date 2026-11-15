import { decodeRecording } from '../../../cases/recordingFile';
import { keepTries } from '../../../cases/tryStore';
import { tryRecordOf, type StoredTry } from '../../../cases/tryFile';
import type { Studio } from '../types';
import type { VisionManifest } from '../../../vision/manifest';
import {
  availableVisionCameras,
  cameraVision,
  cameraVisionError,
  cameraVisionSignals,
  configureVisionCamera,
  loadVisionManifest,
  visionAssignments,
} from '../../../cameras/visionSession';
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

function cameraVisionState() {
  const cameras = availableVisionCameras();

  return {
    cameras,
    assignments: visionAssignments(),
    results: Object.fromEntries(cameras.map((camera) => [camera, cameraVision(camera)])),
    models: Object.fromEntries(
      visionAssignments().map(({ camera, modelId }) => [`${camera}:${modelId}`, cameraVision(camera, modelId)]),
    ),
    errors: Object.fromEntries(cameras.map((camera) => [camera, cameraVisionError(camera)])),
    signals: cameraVisionSignals(cameras),
  };
}

export default function camerasStudio(studio: Studio) {
  return {
    playCameraTry: async (input: { stored: StoredTry; recording: number[]; video: number[] }) => {
      const recording = decodeRecording(new Uint8Array(input.recording));
      const camera = input.stored.videos?.[0]?.camera;

      if (!recording || !camera) throw new Error('The camera fixture needs a recording and a video.');

      await keepTries([{ stored: input.stored, recording, videos: [{ camera, bytes: new Uint8Array(input.video) }] }]);

      return studio().core.simTraining.cases.timeline.show(tryRecordOf(input.stored));
    },
    configureVision: async (manifest: VisionManifest, bytes: number[], cameras: string[]) => {
      await loadVisionManifest(manifest, new Uint8Array(bytes));
      await Promise.all(cameras.map((camera) => configureVisionCamera(camera, { modelId: manifest.id, fps: 10 })));

      return cameraVisionState();
    },
    cameraVisionState,
    feedPose: (samples: PoseSample[], fps?: number) => feedOperatorPose(samples, fps),
    feedHand: (samples: HandSample[], fps?: number) => feedOperatorHand(samples, fps),
    feedFace: (samples: FaceSample[], fps?: number) => feedOperatorFace(samples, fps),
    operatorCamera: () => operatorCameraState(),
    cameraStreams: () => ({ ...streamCost }),
    phone: () => phoneSnapshot(),
  };
}

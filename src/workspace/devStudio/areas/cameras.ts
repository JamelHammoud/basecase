import { decodeRecording } from '../../../cases/recordingFile';
import { keepTries } from '../../../cases/tryStore';
import { tryRecordOf, type StoredTry } from '../../../cases/tryFile';
import type { VisionManifest } from '../../../vision/manifest';
import { loadVisionManifest } from '../../../cameras/visionSession';
import type { CameraVision } from '../../../cameras/scopedVision';
import { cameraFeed } from '../../../cameras/viewsClient';
import { cameraViews, stripParts } from '../../../cameras/views';
import type { Studio, StudioContext } from '../types';
import { encodeBitmap } from '../../../utils/imageEncode';
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

async function floorCameraFrame({ core, posesRef }: StudioContext, key: string) {
  const sim = core.simTraining.sim;
  const parts = stripParts(core.parts);
  const views = cameraViews(parts, sim.worldParts, core.project.cameras ?? []);
  const feed = cameraFeed();

  try {
    await feed.load({ parts, world: sim.worldParts.filter((part) => part.visible !== false), views, model: sim.model });

    const { bitmaps } = await feed.frame({ keys: [key], poses: posesRef.current?.slice() ?? null });
    const bitmap = bitmaps[key];

    return bitmap ? encodeBitmap({ bitmap, type: 'image/png' }) : null;
  } finally {
    feed.dispose();
  }
}

function cameraVisionState(vision: CameraVision) {
  const { availableVisionCameras, visionAssignments, cameraVision, cameraVisionError, cameraVisionSignals } = vision;
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
  const activeVision = (camera?: string) => {
    const { vision } = studio().core;

    if (vision.playback.recordedCameraViews().some((view) => !camera || view.key === camera)) return vision.recorded;

    return camera === 'operator' || (!camera && vision.operator.availableVisionCameras().length)
      ? vision.operator
      : vision.simulated;
  };

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
      await Promise.all(
        cameras.map((camera) => activeVision(camera).configureVisionCamera(camera, { modelId: manifest.id, fps: 10 })),
      );

      return cameraVisionState(activeVision(cameras[0]));
    },
    cameraVisionState: () => cameraVisionState(activeVision()),
    feedPose: (samples: PoseSample[], fps?: number) => feedOperatorPose(samples, fps),
    feedHand: (samples: HandSample[], fps?: number) => feedOperatorHand(samples, fps),
    feedFace: (samples: FaceSample[], fps?: number) => feedOperatorFace(samples, fps),
    operatorCamera: () => operatorCameraState(),
    cameraFrame: async (key: string, floor = false) => {
      if (floor) return floorCameraFrame(studio(), key);

      const canvases = document.querySelectorAll<HTMLCanvasElement>('[data-testid="camera-tile"] canvas');
      const canvas = [...canvases].find(
        (item) => item.closest('[data-camera]')?.getAttribute('data-camera') === key && !item.closest('[inert]'),
      );

      return canvas ? encodeBitmap({ bitmap: await createImageBitmap(canvas), type: 'image/png' }) : null;
    },
    cameraStreams: () => ({ ...streamCost }),
    phone: () => phoneSnapshot(),
  };
}

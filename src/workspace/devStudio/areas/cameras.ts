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

    const frames = await feed.frame({ keys: [key], poses: posesRef.current?.slice() ?? null });
    const bitmap = frames[key];

    return bitmap ? encodeBitmap({ bitmap, type: 'image/png' }) : null;
  } finally {
    feed.dispose();
  }
}

export default function camerasStudio(studio: Studio) {
  return {
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

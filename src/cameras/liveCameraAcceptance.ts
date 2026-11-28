import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { ScenePart } from '../types/robotics';
import type { VisionManifest } from '../vision/manifest';
import type { VisionResult } from '../vision/types';
import { useCameraFeed, type CameraFeedInput } from './useCameraFeed';
import { createVisionScope, VisionScopeContext, type VisionScope } from './visionScope';
import { loadVisionManifest } from './visionSession';
import { cameraViews } from './views';
import type { FixedCamera } from './fixed';

function CameraFeedHarness(input: CameraFeedInput) {
  useCameraFeed(input);

  return null;
}

export async function observeCamera(input: {
  parts: ScenePart[];
  cameras: FixedCamera[];
  manifest: VisionManifest;
  bytes: number[];
  change: 'scene scope' | 'simulation link';
}) {
  await loadVisionManifest(input.manifest, new Uint8Array(input.bytes));

  const host = document.createElement('div');
  const root = createRoot(host);
  let resolveFrame: () => void = () => undefined;
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      resolveFrame = resolve;
    });
  let frame = nextFrame();
  let frames = 0;
  const feed: CameraFeedInput = {
    active: true,
    parts: input.parts,
    world: [],
    model: null,
    views: cameraViews(input.parts, [], input.cameras),
    enlarged: null,
    connectCameras: () => undefined,
    onFrames: (count) => {
      frames = count;
      resolveFrame();
    },
  };
  let scope = createVisionScope('initial');
  const render = (vision: VisionScope) =>
    flushSync(() =>
      root.render(createElement(VisionScopeContext, { value: vision }, createElement(CameraFeedHarness, feed))),
    );
  let stop: () => void = () => undefined;

  document.body.append(host);

  try {
    render(scope);
    await frame;
    frame = nextFrame();

    if (input.change === 'scene scope') scope = createVisionScope('replacement');
    else feed.connectCameras = () => undefined;

    render(scope);
    await frame;

    const vision = scope.simulated;
    const key = feed.views[0].key;

    vision.invalidateVisionCamera(key);

    const result = new Promise<{ value: VisionResult; signals: Record<string, number>; frames: number }>(
      (resolve, reject) => {
        stop = vision.onCameraVision(() => {
          const error = vision.cameraVisionError(key);
          const value = vision.cameraVision(key);

          if (error) reject(new Error(error));

          if (value) resolve({ value, signals: vision.cameraVisionSignals(), frames });
        });
      },
    );

    await vision.configureVisionCamera(key, { modelId: input.manifest.id, fps: 10 });

    return { ...(await result), assignments: vision.visionAssignments() };
  } finally {
    stop();
    flushSync(() => root.unmount());
    host.remove();
  }
}

Object.assign(window, { observeCamera });

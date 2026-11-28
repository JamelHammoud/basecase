import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { ScenePart } from '../types/robotics';
import type { VisionManifest } from '../vision/manifest';
import { loadVisionManifest } from './visionSession';
import { createVisionScope, VisionScopeContext } from './visionScope';
import { useCameraFeed, type CameraFeedInput } from './useCameraFeed';
import { cameraViews } from './views';
import type { FixedCamera } from './fixed';

function CameraHarness(input: CameraFeedInput) {
  useCameraFeed({ ...input, active: false, onFrames: () => undefined });

  const feed = useCameraFeed(input);

  return createElement('canvas', { ref: feed.canvasRef(input.views[0].key) });
}

export async function mountCamera(input: {
  parts: ScenePart[];
  cameras: FixedCamera[];
  manifest: VisionManifest;
  bytes: number[];
}) {
  await loadVisionManifest(input.manifest, new Uint8Array(input.bytes));

  const host = document.createElement('div');
  const root = createRoot(host);
  let scope = createVisionScope('initial');
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
    },
  };
  const render = () =>
    flushSync(() =>
      root.render(createElement(VisionScopeContext, { value: scope }, createElement(CameraHarness, feed))),
    );

  document.body.append(host);
  render();

  return {
    wait: () =>
      new Promise<void>((resolve, reject) => {
        const ready = () => {
          const key = feed.views[0].key;
          const error = scope.simulated.cameraVisionError(key);

          if (error) {
            reject(new Error(error));

            return true;
          }

          if (scope.simulated.cameraVision(key)) {
            resolve();

            return true;
          }

          return false;
        };
        const stop = scope.simulated.onCameraVision(() => {
          if (ready()) stop();
        });

        if (ready()) stop();
      }),
    configure: () => scope.simulated.configureVisionCamera(feed.views[0].key, { modelId: input.manifest.id, fps: 10 }),
    replace: (kind: 'scene scope' | 'simulation link') => {
      frames = 0;

      if (kind === 'scene scope') scope = createVisionScope('replacement');
      else feed.connectCameras = () => undefined;

      scope.simulated.invalidateVisionCamera(feed.views[0].key);
      render();
    },
    state: () => ({
      frames,
      result: scope.simulated.cameraVision(feed.views[0].key),
      error: scope.simulated.cameraVisionError(feed.views[0].key),
      signals: scope.simulated.cameraVisionSignals(),
      assignments: scope.simulated.visionAssignments(),
    }),
    close: () => {
      flushSync(() => root.unmount());
      host.remove();
    },
  };
}

Object.assign(window, { mountCamera });

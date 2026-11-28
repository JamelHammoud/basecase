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

function CameraTile(input: CameraFeedInput) {
  const feed = useCameraFeed(input);

  return createElement('canvas', { ref: feed.canvasRef(input.views[0].key) });
}

function CameraHarness({ input, visible }: { input: CameraFeedInput; visible: boolean }) {
  useCameraFeed({ ...input, active: false, onFrames: () => undefined });

  return visible ? createElement(CameraTile, input) : null;
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
  let visible = true;
  let connected = false;
  const waiters = new Set<() => void>();
  let closed = false;
  const feed: CameraFeedInput = {
    active: true,
    parts: input.parts,
    world: [],
    model: null,
    views: cameraViews(input.parts, [], input.cameras),
    enlarged: null,
    connectCameras: (link) => {
      connected = Boolean(link);
    },
    onFrames: (count) => {
      frames = count;
      waiters.forEach((listen) => listen());
    },
  };
  const render = () =>
    flushSync(() =>
      root.render(
        createElement(VisionScopeContext, { value: scope }, createElement(CameraHarness, { input: feed, visible })),
      ),
    );

  document.body.append(host);
  render();

  return {
    wait: () =>
      new Promise<void>((resolve, reject) => {
        const ready = () => {
          if (closed) {
            reject(new Error('Camera fixture closed.'));

            return true;
          }

          const key = feed.views[0].key;
          const error = scope.simulated.cameraVisionError(key);

          if (error) {
            reject(new Error(error));

            return true;
          }

          if ((!visible || frames > 0) && scope.simulated.cameraVision(key)) {
            resolve();

            return true;
          }

          return false;
        };
        const changed = () => {
          if (ready()) stop();
        };
        const stopVision = scope.simulated.onCameraVision(changed);
        const stop = () => {
          stopVision();
          waiters.delete(changed);
        };

        waiters.add(changed);
        changed();
      }),
    configure: () => scope.simulated.configureVisionCamera(feed.views[0].key, { modelId: input.manifest.id, fps: 10 }),
    hideTile: () => {
      visible = false;
      frames = 0;
      scope.simulated.invalidateVisionCamera(feed.views[0].key);
      render();
    },
    showTile: () => {
      visible = true;
      frames = 0;
      scope.simulated.invalidateVisionCamera(feed.views[0].key);
      render();
    },
    replace: (kind: 'scene scope' | 'simulation link') => {
      frames = 0;

      if (kind === 'scene scope') scope = createVisionScope('replacement');
      else
        feed.connectCameras = (link) => {
          connected = Boolean(link);
        };

      scope.simulated.invalidateVisionCamera(feed.views[0].key);
      render();
    },
    state: () => ({
      frames,
      connected,
      result: scope.simulated.cameraVision(feed.views[0].key),
      error: scope.simulated.cameraVisionError(feed.views[0].key),
      signals: scope.simulated.cameraVisionSignals(),
      assignments: scope.simulated.visionAssignments(),
    }),
    close: () => {
      if (closed) return;

      closed = true;
      waiters.forEach((listen) => listen());
      flushSync(() => root.unmount());
      host.remove();
    },
  };
}

Object.assign(window, { mountCamera });

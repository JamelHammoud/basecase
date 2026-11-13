import { nextCameraName, MAX_FIXED_CAMERAS, type FixedCamera } from '../cameras/fixed';
import { expandCameraViews } from '../cameras/cameraViewsStore';
import { clampLens, type Lens } from '../cameras/lens';
import type { CameraView } from '../cameras/views';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { confirmAction } from '../design-system/confirmStore';
import type { ProjectSettings } from '../types/robotics';
import { newId } from './helpers';
import type { ShowToast } from './types';

interface FixedCameraOptions {
  project: ProjectSettings;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  showToast: ShowToast;
}

export type FixedCameras = ReturnType<typeof useFixedCameras>;

const withCameras = (p: ProjectSettings, cameras: FixedCamera[]): ProjectSettings => ({
  ...p,
  cameras: cameras.length ? cameras : undefined,
});

export function useFixedCameras({ project, updateProjectNow, viewportRef, showToast }: FixedCameraOptions) {
  'use memo';

  const cameras = project.cameras ?? [];
  const edit = (id: string, patch: (c: FixedCamera) => FixedCamera) =>
    updateProjectNow((p) =>
      withCameras(
        p,
        (p.cameras ?? []).map((c) => (c.id === id ? patch(c) : c)),
      ),
    );

  return {
    cameras,
    add: () => {
      const view = viewportRef.current?.currentView();

      if (!view) return;

      if (cameras.length >= MAX_FIXED_CAMERAS) {
        showToast(`A scene holds up to ${MAX_FIXED_CAMERAS} camera views.`);

        return;
      }

      const camera: FixedCamera = {
        id: newId('camera'),
        name: nextCameraName(cameras),
        position: view.position,
        target: view.target,
        lens: clampLens({ model: 'pinhole', hfovDeg: view.hfovDeg }),
      };

      updateProjectNow((p) => withCameras(p, [...(p.cameras ?? []), camera]));
      expandCameraViews();
      showToast(`Added ${camera.name}`);
    },
    reframe: (id: string) => {
      const view = viewportRef.current?.currentView();

      if (view) edit(id, (c) => ({ ...c, position: view.position, target: view.target }));
    },
    rename: (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 64);

      if (trimmed) edit(id, (c) => ({ ...c, name: trimmed }));
    },
    setLens: (id: string, lens: Lens) => edit(id, (c) => ({ ...c, lens: clampLens(lens) })),
    lookThrough: (view: CameraView) => viewportRef.current?.lookThrough(view),
    remove: (id: string) => {
      const camera = cameras.find((c) => c.id === id);

      if (!camera) return;

      confirmAction({
        title: `Delete ${camera.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () =>
          updateProjectNow((p) =>
            withCameras(
              p,
              (p.cameras ?? []).filter((c) => c.id !== id),
            ),
          ),
      });
    },
  };
}

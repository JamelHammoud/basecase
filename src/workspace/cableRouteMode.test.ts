import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { component, sceneOf } from '../wiring/fixtures';
import { editableNets, routeIdentity } from '../wiring/routeEditing';
import { useCableRoutes, type CableRoutes } from './useCableRoutes';
import type { SceneDocument } from './useSceneDocument';
import type { Posing } from '../utils/usePosing';

it('enters ordinary point editing from other tools and opens the limiting pose with its robot selected', () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')], []);
  const docs = {
    ...scene,
    partsRef: { current: scene.parts },
    projectRef: { current: scene.project },
  } as unknown as SceneDocument;
  const setMode = vi.fn();
  const select = vi.fn();
  const setPose = vi.fn();
  const posing = { pose: { values: {}, root: { position: [1, 2, 3] } }, setPose } as unknown as Posing;
  let routes: CableRoutes | undefined;

  function Harness() {
    routes = useCableRoutes({
      docs,
      sceneId: 'cable-scene',
      posing,
      showToast: vi.fn(),
      ui: { tool: { setMode }, select },
    });

    return null;
  }

  renderToString(createElement(Harness));
  routes!.open(routeIdentity(editableNets(scene)[0])!);
  expect(setMode).toHaveBeenCalledWith('translate');
  expect(select).toHaveBeenCalledWith(['adapter', 'servo']);
  routes!.showPose({ elbow: -90 });
  expect(setPose).toHaveBeenCalledWith({ ...posing.pose, values: { elbow: -90 } });
  expect(setMode).toHaveBeenLastCalledWith('pose');
});

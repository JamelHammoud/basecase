import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { component, sceneOf } from '../wiring/fixtures';
import { editableNets, routeIdentity } from '../wiring/routeEditing';
import { useCableRoutes, type CableRoutes } from './useCableRoutes';
import type { SceneDocument } from './useSceneDocument';
import type { Posing } from '../utils/usePosing';

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();

  return { ...react, useState: vi.fn(react.useState) };
});

it('leaves Build Along and opens ordinary point editing in Build from every entry point', () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')], []);
  const docs = {
    ...scene,
    partsRef: { current: scene.parts },
    projectRef: { current: scene.project },
  } as unknown as SceneDocument;
  const setMode = vi.fn();
  const openRightTab = vi.fn();
  const closeBuildAlong = vi.fn();
  const cancelSketchSupport = vi.fn();
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
      ui: {
        tool: { setMode, openRightTab },
        select,
        buildAlong: { close: closeBuildAlong },
        sketching: { cancelSupport: cancelSketchSupport },
      },
    });

    return null;
  }

  renderToString(createElement(Harness));
  routes!.open(routeIdentity(editableNets(scene)[0])!);
  expect(setMode).toHaveBeenCalledWith('translate');
  expect(closeBuildAlong).toHaveBeenCalledOnce();
  expect(cancelSketchSupport).toHaveBeenCalledOnce();
  expect(openRightTab).toHaveBeenCalledWith('build');
  expect(select).toHaveBeenCalledWith(['adapter', 'servo']);
});

it('reselects the route endpoints for Show Pose after picking an unrelated point owner', () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')], []);
  const identity = routeIdentity(editableNets(scene)[0])!;
  const select = vi.fn();
  const setMode = vi.fn();
  const setPose = vi.fn();
  const posing = { pose: { values: {}, root: { position: [1, 2, 3] } }, setPose } as unknown as Posing;
  let routes: CableRoutes | undefined;

  vi.mocked(useState).mockImplementationOnce(() => [{ sceneId: 'cable-scene', identity }, vi.fn()]);

  function Harness() {
    routes = useCableRoutes({
      docs: scene as unknown as SceneDocument,
      sceneId: 'cable-scene',
      posing,
      showToast: vi.fn(),
      ui: {
        tool: { setMode, openRightTab: vi.fn() },
        select,
        buildAlong: { close: vi.fn() },
        sketching: { cancelSupport: vi.fn() },
      },
    });

    return null;
  }

  renderToString(createElement(Harness));
  select(['clip']);
  routes!.showPose({ elbow: -90 });
  expect(select).toHaveBeenLastCalledWith(['adapter', 'servo']);
  expect(setPose).toHaveBeenCalledWith({ ...posing.pose, values: { elbow: -90 } });
  expect(setMode).toHaveBeenLastCalledWith('pose');
});

import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { useAssemblyCradle, type AssemblyCradle, type CradleOptions } from './useAssemblyCradle';

function optionsForCradle(): CradleOptions {
  const parts = [box('base', [0, 0, 0], [40, 16, 30], 50)];
  const step = { partIds: ['base'], contextIds: [], moves: [], tools: [] };

  return {
    active: true,
    parameters: { status: { state: 'current' } },
    docs: { parts, project: DEFAULT_PROJECT, partsRef: { current: parts } },
    buildAlong: {
      active: true,
      sourceStep: step,
      sourceParts: parts,
      sourceProject: DEFAULT_PROJECT,
      sessionId: 1,
      index: 0,
      plan: { steps: [step] },
      view: null,
    },
    scene: { sceneId: 'robot' },
    printing: { closeTemporary: vi.fn(), printer: {} },
    viewportRef: { current: null },
    guide: { fingerprint: 'robot' },
  } as unknown as CradleOptions;
}

function replay(actions: Array<(cradle: AssemblyCradle, options: CradleOptions) => void>) {
  const options = optionsForCradle();

  function Harness() {
    const [index, setIndex] = useState(0);
    const cradle = useAssemblyCradle(options);
    const action = actions[index];

    if (action) {
      action(cradle, options);
      setIndex(index + 1);
    }

    return null;
  }

  renderToString(createElement(Harness));
}

it('closes cradle options across workspace and step changes and starts a new cradle in its working position', () => {
  replay([
    (cradle) => {
      expect(cradle.available).toBe(true);
      cradle.show();
    },
    (cradle) => {
      expect(cradle.open).toBe(true);
      cradle.toggleRemoval();
    },
    (cradle, options) => {
      expect(cradle.removing).toBe(true);
      options.active = false;
    },
    () => {},
    (cradle, options) => {
      expect(cradle.open).toBe(false);
      expect(cradle.available).toBe(false);
      options.active = true;
    },
    (cradle) => {
      expect(cradle.open).toBe(false);
      cradle.show();
    },
    (cradle, options) => {
      expect(cradle.open).toBe(true);
      expect(cradle.removing).toBe(false);
      options.buildAlong.sourceStep = { ...options.buildAlong.sourceStep! };
      options.buildAlong.index++;
    },
    () => {},
    (cradle) => expect(cradle.open).toBe(false),
  ]);
});

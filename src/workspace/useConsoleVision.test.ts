import { describe, expect, it } from 'vitest';
import type { CaseConsole } from '../cases/console/format';
import { consoleVisionCameras } from './useConsoleVision';

const console: CaseConsole = {
  input: [],
  layout: { areas: [] },
  signals: [{ id: 'cups', kind: 'counter', when: { signal: 'vision.scene.cup.count', above: 0 } }],
  panels: [
    { id: 'value', kind: 'value', signal: 'vision.front.person' },
    {
      id: 'code',
      kind: 'code',
      source: '<script>studio.signals(["vision.front.person", "vision.wrist.cup.x"])</script>',
    },
  ],
};

describe('console vision subscriptions', () => {
  it('finds model cameras used by signals and code without needing a camera panel', () => {
    expect(consoleVisionCameras(console)).toEqual(['scene', 'front', 'wrist']);
    expect(consoleVisionCameras({ ...console, panels: [], signals: [] })).toEqual([]);
  });
});

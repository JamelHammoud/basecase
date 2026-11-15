import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { usePrintMode } from './usePrintMode';

const leg: ScenePart = {
  id: 'leg',
  name: 'Leg',
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
};

type PrintMode = ReturnType<typeof usePrintMode>;

type Options = Parameters<typeof usePrintMode>[0];

function replay(actions: Array<(mode: PrintMode, options: Options) => void>) {
  const fit = { active: false, leave: vi.fn(), start: vi.fn().mockResolvedValue(true) };
  const options = { jobId: 'robot', parts: [leg], fit };
  let index = 0;

  function Harness() {
    const mode = usePrintMode(options);
    const action = actions[index++];

    action?.(mode, options);

    return null;
  }

  renderToString(createElement(Harness));

  return fit;
}

describe('replacement Print mode', () => {
  it('opens on the requested part and removes its scope when Done closes it', () => {
    const fit = replay([
      (mode) => mode.openRepairPlate('leg'),
      (mode) => {
        expect(mode.mode).toEqual({ plate: 1, selected: 'leg', face: false });
        expect(mode.repairId).toBe('leg');
        expect(mode.canMerge).toBe(false);
        mode.closeMode();
      },
      (mode) => {
        expect(mode.mode).toBeNull();
        expect(mode.repairId).toBeNull();
      },
    ]);

    expect(fit.start).not.toHaveBeenCalled();
  });

  it('normal Print clears a replacement scope', () => {
    replay([
      (mode) => mode.openRepairPlate('leg'),
      (mode) => mode.openMode(2),
      (mode) => {
        expect(mode.mode?.plate).toBe(2);
        expect(mode.repairId).toBeNull();
      },
    ]);
  });

  it('keeps repair face, rotation and placement changes temporary and discards them on close', () => {
    replay([
      (mode) => mode.openRepairPlate('leg'),
      (mode) => {
        expect(mode.editRepairPrint(['leg'], { down: [1, 0, 0], at: [30, 40], turned: true })).toBe(true);
      },
      (mode, options) => {
        expect(mode.repairPrint).toEqual({ down: [1, 0, 0], at: [30, 40], turned: true });
        expect(mode.repairPart?.print).toMatchObject({
          down: [1, 0, 0],
          at: [30, 40],
          turned: true,
          copies: 1,
          skip: false,
          plate: 1,
        });
        expect(options.parts[0]).toEqual(leg);
        mode.closeMode();
      },
      (mode) => {
        expect(mode.repairPrint).toBeUndefined();
        expect(mode.editRepairPrint(['leg'], { turned: true })).toBe(false);
        mode.openRepairPlate('leg');
      },
      (mode) => expect(mode.repairPrint).toBeUndefined(),
    ]);
  });

  it('clears scope when the scene changes and does not revive it on returning', () => {
    replay([
      (mode) => mode.openRepairPlate('leg'),
      (mode, options) => {
        options.jobId = 'other';
        mode.setFaceMode(true);
      },
      () => {},
      (mode, options) => {
        expect(mode.repairId).toBeNull();
        expect(mode.mode).toBeNull();
        options.jobId = 'robot';
        mode.setFaceMode(false);
      },
      () => {},
      (mode) => expect(mode.repairId).toBeNull(),
    ]);
  });
});

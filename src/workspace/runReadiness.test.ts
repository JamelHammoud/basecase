import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import type { PrinterSetup } from '../data/printers';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { batteriesIn, projectFingerprint, runReadiness, type ReadinessWorld } from './runReadiness';

const part: ScenePart = {
  id: 'p',
  name: 'Plate',
  kind: 'cad_part',
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
const project = { printer: 'default', material: 'PLA', infillPct: 15, joints: [], budgetUsd: 100 } as ProjectSettings;
const world: ReadinessWorld = { purchases: {}, money: { code: 'USD', ratesDate: '2026-01-01' } };
const print = (of: ScenePart[] = [part], settings = project, around = world) =>
  projectFingerprint(of, settings, 'p1s', around);
const edited = (change: Partial<ScenePart>) => print([{ ...part, ...change }]);
const sculpt = (value: number) =>
  edited({ sculptMesh: { positions: Array.from({ length: 900 }, (_, i) => (i === 800 ? value : i)) } });

describe('what makes checks run again', () => {
  it.each<[string, Partial<ScenePart>]>([
    ['material', { printMaterial: 'PETG' }],
    ['role', { role: 'cutout' }],
    ['visibility', { visible: false }],
    ['tag', { mechanicalTag: 'CNC Aluminum' }],
    ['sheet', { sheet: { material: 'aluminum' } }],
    ['note', { note: 'Clear acrylic disc' }],
    ['name', { name: 'Glass' }],
    ['weight', { massG: 900 }],
    ['skip printing', { print: { skip: true } }],
    ['print face', { print: { down: [1, 0, 0] } }],
    ['imported mesh', { mesh: { positions: [0, 0, 0], indices: [], baseSize: [1, 1, 1] } }],
    ['move', { position: [1, 0, 0] }],
  ])('a part’s %s', (_name, change) => {
    expect(edited(change)).not.toBe(print());
  });

  it('a sculpted vertex anywhere in the mesh', () => {
    expect(sculpt(1)).not.toBe(sculpt(5000));
  });

  it.each<[string, Partial<ProjectSettings>]>([
    ['infill', { infillPct: 100 }],
    ['gait', { animations: [{ id: 'a', name: 'walk' }] as ProjectSettings['animations'] }],
    ['first ranges', { firstRanges: { j: [-90, 90] } }],
    ['print quality', { printProcess: 'fine' }],
    ['active calibration', { servoCalibrations: { j: { versions: [], active: 1 } } }],
  ])('the project’s %s', (_name, change) => {
    expect(print([part], { ...project, ...change })).not.toBe(print());
  });

  it('a saved price', () => {
    expect(print([part], project, { ...world, purchases: { key: { usd: 3 } } })).not.toBe(print());
  });

  it('the currency or its rates', () => {
    expect(print([part], project, { ...world, money: { code: 'EUR', ratesDate: '2026-01-01' } })).not.toBe(print());
    expect(print([part], project, { ...world, money: { code: 'USD', ratesDate: '2026-02-01' } })).not.toBe(print());
  });

  it('nothing else: the same inputs read the same', () => {
    expect(print([{ ...part }], { ...project }, { ...world, purchases: {} })).toBe(print());
    expect(print([part], project, { ...world, purchases: null })).toBe(print());
  });
});

describe('batteries with leads', () => {
  const component = (id: string, componentId: string) => ({ ...part, id, kind: 'component', componentId }) as ScenePart;

  it('leaves out a bare cell, which has none', () => {
    expect(batteriesIn([component('cell', 'molicel-p28a')])).toEqual([]);
  });

  it('keeps a pack', () => {
    const pack = Object.values(COMPONENT_BY_ID).find((c) => c.battery && !c.battery.cell)!;

    expect(batteriesIn([component('pack', pack.id)])).toEqual(['pack']);
  });
});

describe('running the checks', () => {
  it('waits for meshes before it measures anything', async () => {
    let loaded = () => {};
    const viewport = {
      meshesReady: () =>
        new Promise<void>((resolve) => {
          loaded = resolve;
        }),
      assembly: vi.fn(() => new Promise(() => {})),
      printShapes: vi.fn(() => new Promise(() => {})),
      measureParts: vi.fn(() => new Promise(() => {})),
      interference: vi.fn(() => new Promise(() => {})),
    } as unknown as Viewport3DHandle;

    void runReadiness({
      viewport,
      parts: [part],
      project,
      printer: {} as PrinterSetup,
      fingerprint: 'x',
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(viewport.assembly).not.toHaveBeenCalled();
    loaded();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(viewport.assembly).toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import type { HardwareSpec } from '../data/hardware';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { guideHtml } from './doc/guideDocument';
import { guideFingerprint } from './guideFingerprint';
import { buildGuidePlan } from './guidePlan';
import { approximateScene } from './guideScene';
import type { GuidePlan } from './guideTypes';
import type { GuideDrawings } from './render/guideDrawings';

type V3 = [number, number, number];

const part = (id: string, position: V3, size: V3, o: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const screw = (id: string, position: V3): ScenePart =>
  part(id, position, [5.5, 11, 5.5], {
    kind: 'hardware',
    hardware: { type: 'socket_head', size: 'M3', length: 8 } as HardwareSpec,
  });

const insert = (id: string, position: V3): ScenePart =>
  part(id, position, [4.6, 4, 4.6], { kind: 'hardware', hardware: { type: 'heat_insert', size: 'M3', length: 4 } });

const servo = (id: string, position: V3): ScenePart =>
  part(id, position, [30, 40, 25], { name: `${id} servo`, kind: 'component', componentId: 'feetech-sts3215' });

function leg(side: 'Left' | 'Right', x: number): ScenePart[] {
  const s = side.toLowerCase();

  return [
    servo(`${s}-hip`, [x, 150, 0]),
    part(`${s}-thigh`, [x, 100, 0], [30, 60, 30], { name: `${side} Thigh` }),
    screw(`${s}-thigh-screw`, [x, 129, 0]),
    part(`${s}-shin`, [x * 1.4, 45, 0], [30, 50, 30], { name: `${side} Shin` }),
    part(`${s}-foot`, [x * 1.4, 10, 8], [36, 20, 60], { name: `${side} Foot` }),
  ];
}

const parts: ScenePart[] = [
  part('torso', [0, 210, 0], [100, 80, 60], { name: 'Torso Frame' }),
  part('shell', [0, 212, 0], [116, 92, 76], { name: 'Torso Shell' }),
  insert('shell-insert', [0, 257, 0]),
  ...leg('Left', 30),
  ...leg('Right', -30),
];

const joints: RobotJoint[] = ['left', 'right'].flatMap((s) => [
  {
    id: `${s}_hip`,
    name: `${s}_hip`,
    type: 'revolute',
    parent: ['torso'],
    child: [`${s}-thigh`, `${s}-thigh-screw`],
    actuators: [`${s}-hip`],
    origin: [0, 150, 0],
    axis: [1, 0, 0],
    limb: 'leg',
  },
  {
    id: `${s}_knee`,
    name: `${s}_knee`,
    type: 'revolute',
    parent: [`${s}-thigh`],
    parentJoint: `${s}_hip`,
    child: [`${s}-shin`, `${s}-foot`],
    origin: [0, 70, 0],
    axis: [1, 0, 0],
    limb: 'leg',
  },
]);

const plan = (): GuidePlan => buildGuidePlan(approximateScene('Test Bot', parts, joints), 'PETG');

const stepWith = (p: GuidePlan, id: string) => p.steps.findIndex((s) => s.partIds.includes(id) && s.kind !== 'attach');

describe('build guide plan', () => {
  it('builds each leg as a sub-assembly and the right one as a mirror of the left', () => {
    const { modules } = plan();
    const right = modules.find((m) => m.name === 'Right leg');

    expect(modules.map((m) => m.name)).toEqual(['', 'Left leg', 'Right leg']);
    expect(right?.repeatOf).toBe(modules[1].id);
    expect(right?.mirrored).toBe(true);
  });

  it('puts frames before covers, inserts before their part, and screws joining a limb at its attach step', () => {
    const p = plan();

    expect(stepWith(p, 'torso')).toBeLessThan(stepWith(p, 'shell'));
    expect(p.steps[stepWith(p, 'shell-insert')].kind).toBe('inserts');
    expect(stepWith(p, 'shell-insert')).toBeLessThan(stepWith(p, 'shell'));
    expect(p.steps.find((s) => s.partIds.includes('left-thigh-screw'))).toMatchObject({
      kind: 'attach',
      attach: p.modules.find((m) => m.name === 'Left leg')?.id,
    });
    expect(p.steps.filter((s) => s.kind === 'attach').map((s) => s.attach)).toEqual(
      p.modules.filter((m) => m.parent).map((m) => m.id),
    );
  });

  it('labels parts with letters and hardware with numbers, and lists the tools', () => {
    const p = plan();
    const screws = p.items.find((i) => i.kind === 'hardware' && i.hardware?.type === 'socket_head');

    expect(p.items.filter((i) => i.kind !== 'hardware').every((i) => /^[A-Z]+$/.test(i.label))).toBe(true);
    expect(screws?.qty).toBe(2);
    expect(Number(screws?.label)).toBeGreaterThanOrEqual(101);
    expect(p.tools.map((t) => t.name)).toEqual(['3D printer, PETG', '2.5 mm hex key', 'Soldering iron']);
  });

  it('lays the plan out as pages', () => {
    const p = plan();
    const blank = { dataUrl: 'data:image/png;base64,', width: 400, height: 300, arrows: [], points: [] };
    const drawings: GuideDrawings = {
      cover: blank,
      items: Object.fromEntries(p.items.map((i) => [i.key, { thumb: blank }])),
      modules: Object.fromEntries(p.modules.map((m) => [m.id, blank])),
      steps: p.steps.map(() => ({ main: blank, view: 'front' as const })),
    };
    const meta = { title: 'Test Bot', material: 'PETG', infillPct: 15, date: 'today', mark: '' };
    const { html, pages } = guideHtml({ plan: p, drawings, meta });

    expect(pages).toBeGreaterThan(5);
    expect(html).toContain('Before you start');
    expect(html).toContain('Build like Left leg, mirrored');
  });

  it('follows the proven assembly order and marks the steps the planner could not place', () => {
    const order = { assembly: ['shell', 'torso'], unproven: ['left-foot'] };
    const p = buildGuidePlan({ ...approximateScene('Test Bot', parts, joints), order }, 'PETG');

    expect(stepWith(p, 'shell')).toBeLessThan(stepWith(p, 'torso'));
    expect(p.steps[stepWith(p, 'left-foot')].unproven).toBe(true);
    expect(p.steps[stepWith(p, 'torso')].unproven).toBeUndefined();
    expect(plan().steps.some((s) => s.unproven)).toBe(false);
  });

  it('changes its fingerprint only when the build changes', () => {
    const project = { printer: 'bambu-p1s' as const, material: 'PETG' as const, infillPct: 15, joints };
    const before = guideFingerprint('Test Bot', parts, project);
    const moved = parts.map((x) => (x.id === 'shell' ? { ...x, position: [0, 220, 0] as V3 } : x));

    expect(guideFingerprint('Test Bot', [...parts], project)).toBe(before);
    expect(guideFingerprint('Test Bot', moved, project)).not.toBe(before);
  });
});

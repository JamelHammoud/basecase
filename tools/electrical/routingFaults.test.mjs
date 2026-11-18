import { expect, it } from 'vitest';
import { defineBoard } from '../../src/wiring/boardDefinition';
import { projectBoard } from '../../src/wiring/boardProjection';
import { boardPcb } from '../../src/wiring/boardPcb';
import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from '../../src/wiring/boardKiCad.mjs';
import { reconcileRoutedBoard } from '../../src/wiring/boardReconcile.mjs';
import { routingFaultCases } from './routingFaults.mjs';

const sourceFingerprint = 'a'.repeat(64);
const variants = ['top', 'bottom'].flatMap((side) => [0, 90, 180, 270].map((rotation) => ({ side, rotation })));

function generatedBoard({ side, rotation }) {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm').scene;
  const { board, part } = defineBoard(scene, 'board');

  board.side = side;
  board.placements = board.placements.map((placement, i) => ({
    ...placement,
    position: [-30, -30 + i * 24],
    rotation,
    unplaced: false,
  }));

  const projection = projectBoard({
    ...scene,
    parts: [...scene.parts, part],
    project: { ...scene.project, electronicsBoard: board },
  });

  return boardPcb(projection)['robot.kicad_pcb'].replace(
    /\)\s*$/u,
    `(property "BasecaseSource" "${sourceFingerprint}"))`,
  );
}

function padGap(pcb) {
  const board = readKiCadBoard(pcb);
  const footprint = kiCadChildren(board, 'footprint').find((node) =>
    kiCadChildren(node, 'pad').some((pad) => pad[1] === '1'),
  );
  const pads = ['1', '2'].map((number) => kiCadChildren(footprint, 'pad').find((pad) => pad[1] === number));
  const positions = pads.map((pad) => kiCadChild(pad, 'at').slice(1, 3).map(kiCadNumber));
  const radii = pads.map((pad) => kiCadNumber(kiCadChild(pad, 'size')[1]) / 2);

  expect(kiCadChild(pads[0], 'net')[1]).not.toBe(kiCadChild(pads[1], 'net')[1]);

  return Math.hypot(positions[1][0] - positions[0][0], positions[1][1] - positions[0][1]) - radii[0] - radii[1];
}

it.each(variants)(
  'seeds pad faults independently of routed track collisions on $side at $rotation degrees',
  (variant) => {
    const generated = generatedBoard(variant);
    const crossing = '(segment (start -30 -30) (end -27.5 -30) (width 0.25) (layer "F.Cu") (net 1))';
    const pcb = generated.replace(/\)\s*$/u, `${crossing})`);
    const original = readKiCadBoard(pcb);
    const request = { pcb, expected: generated };
    const faults = routingFaultCases(request);
    const short = faults.find((fault) => fault.name === 'short');
    const clearance = faults.find((fault) => fault.name === 'clearance');

    expect(padGap(pcb)).toBeGreaterThan(0.2);
    expect(padGap(short.pcb)).toBeCloseTo(-0.1);
    expect(padGap(clearance.pcb)).toBeCloseTo(0.1);
    expect(short.type).toBe('shorting_items');
    expect(clearance.type).toBe('clearance');

    for (const fault of [short, clearance]) {
      const candidate = readKiCadBoard(fault.pcb);

      expect(reconcileRoutedBoard({ expected: generated, imported: fault.pcb, sourceFingerprint }).accepted).toBe(
        false,
      );
      expect(reconcileRoutedBoard({ expected: fault.expected, imported: fault.pcb, sourceFingerprint })).toMatchObject({
        accepted: true,
        segments: 1,
      });
      expect(fault.expected).toBe(fault.pcb);

      expect(kiCadChildren(candidate, 'segment')).toEqual(kiCadChildren(original, 'segment'));
      expect(kiCadChildren(candidate, 'footprint')).toHaveLength(kiCadChildren(original, 'footprint').length);
      expect(fault.pcb.replace(/\(size 3\.[15] 3\.[15]\)/u, '(size 1.7 1.7)')).toBe(pcb);
    }

    expect(request).toEqual({ pcb, expected: generated });
  },
);

it('refuses to silently omit a fault when the expected header geometry changes', () => {
  const pcb = generatedBoard(variants[0]).replace(/\(size 1\.7 1\.7\)/gu, '(size 1.8 1.8)');

  expect(() => routingFaultCases({ pcb, expected: pcb })).toThrow(
    'Routing fault controls require the JST header pad geometry.',
  );
});

it('retains missing and independently tightened native manufacturing rules without editing copper', () => {
  const pcb = generatedBoard(variants[0]);
  const rules = { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 };
  const faults = routingFaultCases({ pcb, rules });

  expect(faults.find((fault) => fault.name === 'missing-rules')).toMatchObject({
    pcb,
    rules: null,
    issue: 'board-manufacturing',
  });

  for (const field of ['clearanceMm', 'trackWidthMm', 'drillMm'])
    expect(faults.find((fault) => fault.name === field)).toMatchObject({
      pcb,
      rules: { ...rules, [field]: 1.1 },
      issue: 'board-drc',
    });
});

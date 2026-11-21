import { describe, expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { projectBoard } from './boardProjection';
import { boardPcb } from './boardPcb';
import { readKiCadBoard } from './boardKiCad.mjs';
import { reconcileRoutedBoard } from './boardReconcile.mjs';

const source = 'a'.repeat(64);
const marker = `(property "BasecaseSource" "${source}")`;
const copper = '(segment (start 0 0) (end 1 0) (width 0.25) (layer "F.Cu") (net 1))';
const insert = (pcb: string, content: string) => pcb.replace(/\)\s*$/, `${content})`);

function fixture(name = 'dual-bus-arm') {
  const { scene } = electricalScenes().find((entry) => entry.name === name)!;
  const { board, part, hardwareParts } = defineBoard(scene, 'board');
  const projection = projectBoard({
    parts: [...scene.parts, part, ...hardwareParts],
    project: { ...scene.project, electronicsBoard: board },
  });
  const pcb = insert(boardPcb(projection)['robot.kicad_pcb'], marker);

  return { pcb, projection };
}

describe('routed KiCad reconciliation', () => {
  it.each(electricalScenes())(
    'retains exact supported identities and unresolved requirements for $name',
    ({ name }) => {
      const { pcb, projection } = fixture(name);
      const before = structuredClone(projection);
      const routed = insert(pcb, copper);
      const result = reconcileRoutedBoard({ expected: pcb, imported: routed, sourceFingerprint: source });

      expect(result).toEqual({ accepted: true, translationMm: [0, 0], segments: 1, vias: 0 });
      expect(projection).toEqual(before);
      expect(projection.electrical.requirements.length).toBeGreaterThan(0);
      expect(projection.requirements.some((finding) => finding.code === 'board-unmapped')).toBe(true);
    },
  );

  it('permits one common translation after comparing every outline, footprint and mounting hole', () => {
    const { pcb } = fixture();
    const translate = (_match: string, field: string, x: string, y: string) =>
      `(${field} ${Number(x) + 100} ${Number(y) + 80}`;
    const moved = pcb.replace(/\((at|start|end) (-?[\d.]+) (-?[\d.]+)/g, translate);

    expect(reconcileRoutedBoard({ expected: pcb, imported: moved, sourceFingerprint: source }).accepted).toBe(false);

    const outlineOnly = pcb.replace(/\((start|end) (-?[\d.]+) (-?[\d.]+)/g, translate);

    expect(reconcileRoutedBoard({ expected: pcb, imported: outlineOnly, sourceFingerprint: source }).accepted).toBe(
      false,
    );

    const equivalent = pcb
      .replace(
        /(\(gr_line \(start )(-?[\d.]+) (-?[\d.]+)/g,
        (_match, prefix, x, y) => `${prefix}${Number(x) + 100} ${Number(y) + 80}`,
      )
      .replace(
        /(\(gr_line \(start [^)]+\) \(end )(-?[\d.]+) (-?[\d.]+)/g,
        (_match, prefix, x, y) => `${prefix}${Number(x) + 100} ${Number(y) + 80}`,
      )
      .replace(
        /(\(uuid [^)]+\)\s*\(at )(-?[\d.]+) (-?[\d.]+)/g,
        (_match, prefix, x, y) => `${prefix}${Number(x) + 100} ${Number(y) + 80}`,
      );

    expect(reconcileRoutedBoard({ expected: pcb, imported: equivalent, sourceFingerprint: source })).toEqual({
      accepted: true,
      translationMm: [100, 80],
      segments: 0,
      vias: 0,
    });
  });

  it.each([
    ['wrong source', (pcb: string) => pcb.replace(source, 'b'.repeat(64)), 'board-source'],
    [
      'moved footprint',
      (pcb: string) =>
        pcb.replace(/(\(footprint "Robot:JST[^]*?\(at )(-?[\d.]+) (-?[\d.]+)/, (_match, prefix) => `${prefix}500 500`),
      'board-mapping',
    ],
    ['changed mounting hole', (pcb: string) => pcb.replace('(drill 3.2)', '(drill 3.5)'), 'board-hole'],
    ['changed pad identity', (pcb: string) => pcb.replace('(pad "1"', '(pad "01"'), 'board-mapping'],
    [
      'contradictory net number and name',
      (pcb: string) => pcb.replace(/(\(pad "1"[^]*?\(net )\d+/, '$199999'),
      'board-mapping',
    ],
    [
      'altered pad mapping',
      (pcb: string) => pcb.replace(/\(net (\d+) "\/[^"\n]+"\)/, '(net $1 "/wrong")'),
      'board-mapping',
    ],
    ['unsupported layer', (pcb: string) => insert(pcb, copper.replace('F.Cu', 'In1.Cu')), 'board-format'],
    ['malformed copper', (pcb: string) => insert(pcb, copper.replace('0.25', 'nan')), 'board-format'],
    ['zero-width copper', (pcb: string) => insert(pcb, copper.replace('0.25', '0')), 'board-format'],
    ['unknown net', (pcb: string) => insert(pcb, copper.replace('(net 1)', '(net 99999)')), 'board-mapping'],
    ['unsupported zone', (pcb: string) => insert(pcb, '(zone (net 1))'), 'board-format'],
    [
      'out-of-range copper coordinates',
      (pcb: string) => insert(pcb, copper.replace('(start 0 0)', '(start 100000 0)')),
      'board-format',
    ],
    [
      'extra copper coordinates',
      (pcb: string) => insert(pcb, copper.replace('(start 0 0)', '(start 0 0 0)')),
      'board-format',
    ],
    ['unsupported arc', (pcb: string) => insert(pcb, '(arc (net 1))'), 'board-format'],
    ['ambiguous source marker', (pcb: string) => insert(pcb, marker), 'board-source'],
  ])('refuses %s', (_name, edit, code) => {
    const { pcb } = fixture();

    expect(reconcileRoutedBoard({ expected: pcb, imported: edit(pcb), sourceFingerprint: source })).toEqual({
      accepted: false,
      code,
    });
  });

  it('bounds nested comparison work without expanding escaped tree strings', () => {
    const { pcb } = fixture();
    const nested = `${'(nested '.repeat(32)}"leaf"${')'.repeat(32)}`;
    const imported = pcb.replace('(general (thickness 1.6))', `(general (thickness 1.6) ${nested})`);

    expect(reconcileRoutedBoard({ expected: pcb, imported, sourceFingerprint: source })).toEqual({
      accepted: false,
      code: 'board-geometry',
    });
  });

  it.each([
    '',
    '(kicad_pcb',
    '(kicad_pcb) (kicad_pcb)',
    '(kicad_pcb (property "x" "unterminated))',
    '(kicad_pcb (property "x" "bad\\q"))',
    `(kicad_pcb ${'('.repeat(50)}${')'.repeat(50)})`,
    `(kicad_pcb ${'(net 1 "x")'.repeat(100_001)})`,
    `(kicad_pcb ${'x '.repeat(500_001)})`,
    `(kicad_pcb (property "x" "${'x'.repeat(8 * 1024 * 1024)}"))`,
    `(kicad_pcb (property "x" "${'é'.repeat(4 * 1024 * 1024)}"))`,
    '(kicad_pcb (model "../../auth.json"))',
    '(kicad_pcb (image (data "AAAA")))',
    '(kicad_pcb (MoDeL "../../secret.step"))',
    '(kicad_pcb (footprint "x" (property "Value" "x" (effects (font (face "../../secret.ttf"))))))',
    '(kicad_pcb (setup (pcbplotparams (drawing_sheet "../../secret.kicad_wks"))))',
    '(kicad_pcb (embedded_fonts yes))',
    '(kicad_pcb (embedded_files (file (name "../auth.json"))))',
    '(kicad_pcb (footprint "x" (model "${KIPRJMOD}/../secret.step")))',
  ])('refuses hostile syntax and assets before native processing', (pcb) => {
    expect(() => readKiCadBoard(pcb)).toThrow();
  });
});

it('preserves supported through vias and refuses blind or buried layer pairs', () => {
  const { pcb } = fixture();
  const via = '(via (at 0 0) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))';
  const accepted = reconcileRoutedBoard({ expected: pcb, imported: insert(pcb, via), sourceFingerprint: source });

  expect(accepted).toEqual({ accepted: true, translationMm: [0, 0], segments: 0, vias: 1 });
  expect(
    reconcileRoutedBoard({
      expected: pcb,
      imported: insert(pcb, via.replace('"B.Cu"', '"In1.Cu"')),
      sourceFingerprint: source,
    }),
  ).toEqual({ accepted: false, code: 'board-format' });
});

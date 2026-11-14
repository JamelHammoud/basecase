import type { Loop, SheetProfile } from './detectSheet';

const num = (v: number) => String(Math.round(v * 1e4) / 1e4 + 0);

const pairs = (codes: Array<[number, string]>) => codes.map(([code, value]) => `${code}\n${value}`);

function polyline(loop: Loop, layer: string): string[] {
  return [
    ...pairs([
      [0, 'POLYLINE'],
      [8, layer],
      [66, '1'],
      [10, '0'],
      [20, '0'],
      [30, '0'],
      [70, '1'],
    ]),
    ...loop.flatMap(([x, y]) =>
      pairs([
        [0, 'VERTEX'],
        [8, layer],
        [10, num(x)],
        [20, num(y)],
        [30, '0'],
      ]),
    ),
    ...pairs([
      [0, 'SEQEND'],
      [8, layer],
    ]),
  ];
}

const HEADER = pairs([
  [0, 'SECTION'],
  [2, 'HEADER'],
  [9, '$ACADVER'],
  [1, 'AC1009'],
  [9, '$INSUNITS'],
  [70, '4'],
  [0, 'ENDSEC'],
]);

export function sheetDxf(profile: SheetProfile): string {
  return [
    ...HEADER,
    ...pairs([
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]),
    ...polyline(profile.outline, 'OUTLINE'),
    ...profile.holes.flatMap((hole) => polyline(hole, 'HOLES')),
    ...pairs([
      [0, 'ENDSEC'],
      [0, 'EOF'],
    ]),
    '',
  ].join('\n');
}

export function dxfLoops(dxf: string): Loop[] {
  const lines = dxf.split('\n');
  const loops: Loop[] = [];
  let entity = '';

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, value] = [lines[i], lines[i + 1]];

    if (code === '0') entity = value;

    if (code === '0' && value === 'POLYLINE') loops.push([]);

    if (code === '10' && entity === 'VERTEX') loops[loops.length - 1].push([Number(value), Number(lines[i + 3])]);
  }

  return loops;
}

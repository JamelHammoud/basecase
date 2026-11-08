import { describe, expect, it } from 'vitest';
import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import type { FastenerChain } from '../assembly/assemblyTypes';
import { worldPort, portsOf } from '../agent/ports';
import type { ScenePart } from '../types/robotics';
import { fitProbeFindings, hiddenFindings, threadFindings, unprintableFindings } from './buildChecks';

const servo: ScenePart = {
  id: 'servo',
  name: 'Servo',
  kind: 'component',
  componentId: 'feetech-sts3215',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
} as ScenePart;

const horn = worldPort(
  servo,
  portsOf(servo).find((p) => p.name === 'horn-1')!,
);

function chain(off: number, deep: number): FastenerChain {
  const down = horn.axis.map((v) => -v) as [number, number, number];
  const tip = horn.position.map((v, k) => v + down[k] * deep + (k === 0 ? off : 0)) as [number, number, number];

  return {
    id: 'screw',
    d: 3,
    axis: down,
    tip,
    top: tip,
    headR: 3,
    stack: [],
    endsIn: { kind: 'component', id: 'servo' },
    engagementMm: deep,
    needMm: null,
    problems: [],
  };
}

const geometry = (c: FastenerChain, fits = { insertWalls: {}, leadRoomMm: {} }) =>
  ({ chains: { screws: [c], sleeves: [] }, fits }) as unknown as AssemblyGeometry;
const keys = (c: FastenerChain) => threadFindings(geometry(c), [servo]).map((f) => f.key);

describe('screws into catalog parts', () => {
  it('passes a screw in a real hole at a safe depth', () => {
    expect(keys(chain(0, 2.5))).toEqual([]);
  });

  it('flags a screw that goes deeper than the hole', () => {
    expect(keys(chain(0, 4.2))).toEqual(['fit:too-deep:screw']);
  });

  it('flags a hole pattern that is off', () => {
    expect(keys(chain(2.4, 2.5))).toEqual(['fit:misses-hole:screw']);
  });
});

describe('fit probes', () => {
  it('flags an insert with almost no wall, and a pack with no room for its leads', () => {
    const fits = {
      insertWalls: { a: { host: 'servo', minMm: 0.4 }, b: { host: 'servo', minMm: 1.5 } },
      leadRoomMm: { servo: 4 },
    };

    expect(fitProbeFindings(geometry(chain(0, 2), fits), [servo]).map((f) => f.key)).toEqual([
      'fit:insert-wall:a',
      'fit:lead-room:servo',
    ]);
  });
});

describe('parts marked clear', () => {
  const printedPart = (name: string, note = '') =>
    ({ ...servo, id: 'p', kind: 'cad_part', componentId: undefined, name, note }) as ScenePart;
  const blocked = (name: string, note?: string) => unprintableFindings([printedPart(name, note)]).length > 0;

  it.each([
    ['Camera bezel', 'Retains the glass lens'],
    ['Glass-fibre PETG bracket', ''],
    ['Window frame', 'Holds a laser-cut acrylic panel'],
    ['Spacer', 'Not transparent'],
    ['Acrylic panel holder', ''],
    ['Glass lens mount', ''],
    ['Spacer', 'Clear of the motor'],
    ['Lens bezel', 'Glass lens retainer'],
    ['Not transparent', ''],
    ['Fibreglass', ''],
  ])('passes %s, “%s”', (name, note) => {
    expect(blocked(name, note)).toBe(false);
  });

  it.each([
    ['Camera Window', 'Clear acrylic disc'],
    ['Clear window', ''],
    ['Front Glass', ''],
    ['Acrylic panel', ''],
    ['Lens cover', 'Transparent cover'],
    ['Visor', 'Polycarbonate visor'],
  ])('flags %s, “%s”', (name, note) => {
    expect(blocked(name, note)).toBe(true);
  });
});

describe('hidden parts', () => {
  it('are a note naming how many were left out, never a blocker', () => {
    const found = hiddenFindings([servo, { ...servo, id: 'lid', visible: false }]);

    expect(found.map((f) => [f.level, f.ids])).toEqual([['note', ['lid']]]);
    expect(found[0].agentText).toContain('1 hidden part ');
  });

  it('say nothing when everything is shown, or for hidden references', () => {
    expect(hiddenFindings([servo, { ...servo, id: 'ref', visible: false, role: 'reference' }])).toEqual([]);
  });
});

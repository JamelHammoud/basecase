import type { Contract } from '../../contract';
import type { Routine } from '../../../routines/schema';
import type { V3 } from '../../../utils/kinematics';
import { CASE_FORMAT_VERSION, type Case, type CaseProbe, type WorldObject } from '../../schema';

const within = (signal: string, value: number): Contract => ({
  version: 1,
  success: { eventually: { window: 'whole', state: { atom: { expr: { signal }, cmp: '<', value, scale: value } } } },
  failures: [],
});

const object = (id: string, o: Partial<WorldObject> & Pick<WorldObject, 'position' | 'size'>): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  rotation: [0, 0, 0],
  color: '#e8e8e8',
  behavior: 'static',
  ...o,
});

const kase = (id: string, parts: Pick<Case, 'slot' | 'world' | 'task'> & Partial<Case>): Case => ({
  formatVersion: CASE_FORMAT_VERSION,
  id,
  name: id,
  brief: id,
  controls: [],
  reference: { timeline: [] },
  ...parts,
});

const probe = (signal: string, from: CaseProbe['from'], to: CaseProbe['to']): CaseProbe => ({ signal, from, to });

export const LIT = '#ff5a1f';

const ARC_MM = 178.5;
const ANCHOR_Y = 50;

export const WHACK_SPOTS: V3[] = [0, 15, 30, 45, 60, 75].map((deg) => {
  const a = (deg * Math.PI) / 180;

  return [0, ANCHOR_Y + ARC_MM * Math.sin(a), ARC_MM * Math.cos(a)];
});

const hitLogic = (): Routine => ({
  schema: 1,
  id: 'whack-score',
  name: 'Whack Score',
  requires: ['arms', 'speaker'],
  base: { kind: 'do', id: 'start', skill: 'drive', holds: ['body'], timeoutMs: 60_000, onTimeout: [], onFail: [] },
  watchers: [{ id: 'hit', model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'boolean' } }],
  reactions: [
    {
      id: 'on-hit',
      when: { fact: 'hit', is: true },
      cooldownMs: 0,
      onRetrigger: 'ignore',
      body: 'keepGoing',
      steps: [{ kind: 'say', text: 'Hit', timeoutMs: 1000, onTimeout: [], onFail: [] }],
    },
  ],
  safeStop: 'drive',
});

export const whackCase = (): Case =>
  kase('whack-a-target', {
    slot: { needs: ['arm'], minJoints: 2, binding: {} },
    world: {
      objects: [
        ...WHACK_SPOTS.map((position, i) =>
          object(`spot${i + 1}`, {
            kind: 'sphere',
            position,
            size: [34, 34, 34],
            behavior: 'marker',
            color: '#3a3a3a',
          }),
        ),
        object('target', {
          kind: 'sphere',
          position: [0, 2, 0],
          size: [30, 30, 30],
          behavior: 'marker',
          color: '#5a5a5a',
          movable: true,
        }),
      ],
    },
    task: { seconds: 8, probes: [probe('hit', 'end-effector', { object: 'target' })], contract: within('hit', 15) },
    logic: hitLogic(),
  });

export const WHACK = `<script>
const spots = ${JSON.stringify(WHACK_SPOTS)};
let lit = -1;
let hits = 0;
let best = 0;
let due = 0;
const light = () => {
  let next = Math.floor(Math.random() * spots.length);
  if (next === lit) next = (next + 1) % spots.length;
  lit = next;
  due = Infinity;
  basecase.world.set('target', { pose: { position: spots[lit] }, visible: true, colour: '${LIT}' });
};
basecase.store.get('best').then((b) => { best = b ?? 0; });
basecase.signals(['probe.hit', 'time'], (v) => {
  if (v.time >= due) light();
  if (due !== Infinity || v['probe.hit'] > 15) return;
  hits++;
  due = v.time + 0.5;
  basecase.world.set('target', { visible: false });
  basecase.event('hit');
  if (hits > best) { best = hits; basecase.store.set('best', best); }
});
</script>`;

const BOX: V3 = [50, 50, 50];

export const PICKUP: V3 = [0, BOX[1] / 2, 250];
export const PARKED: V3 = [-320, BOX[1] / 2, 250];

const box = (id: string, position: V3) =>
  object(id, { position, size: BOX, behavior: 'dynamic', massG: 60, movable: true });

export const conveyorCase = (): Case =>
  kase('conveyor', {
    slot: { needs: ['arm'], minJoints: 2, binding: {} },
    world: {
      objects: [
        box('box1', PICKUP),
        box('box2', PARKED),
        object('bin', { position: [0, 1, 470], size: [220, 2, 160], behavior: 'marker', color: '#0d99ff' }),
      ],
    },
    task: {
      seconds: 7,
      probes: [
        probe('box1', { object: 'box1' }, { object: 'bin' }),
        probe('box2', { object: 'box2' }, { object: 'bin' }),
      ],
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'score' }, cmp: '>', value: 1.5, scale: 1 } },
          },
        },
        failures: [],
      },
      score: { spot: 'bin', counts: 'in' },
    },
  });

export const CONVEYOR = `<script>
let next = 2;
basecase.signals(['probe.box1', 'probe.box2'], (v) => {
  if (next > 2 || v['probe.box' + (next - 1)] > 80) return;
  basecase.world.set('box' + next, { pose: { position: ${JSON.stringify(PICKUP)}, rotation: [0, 0, 0] } });
  next++;
});
</script>`;

export const sweep = (at: number): Array<{ at: number; target: V3 }> => [
  { at, target: [0, 220, 120] },
  { at: at + 0.6, target: [0, 28, 120] },
  { at: at + 1.2, target: [0, 28, 440] },
  { at: at + 2, target: [0, 220, 440] },
  { at: at + 2.6, target: [0, 220, 120] },
];

export const wallCase = (): Case =>
  kase('wall', {
    slot: { needs: ['wheels'], binding: {} },
    world: {
      objects: [
        object('wall', { position: [0, 100, 320], size: [700, 200, 40], movable: true }),
        object('goal', { position: [0, 1, 700], size: [200, 2, 200], behavior: 'marker', color: '#0d99ff' }),
      ],
    },
    task: { seconds: 6, probes: [probe('goal', 'base', { object: 'goal' })], contract: within('goal', 120) },
  });

export const wallCode = (hide: boolean) => `<script>
let hidden = false;
basecase.drive({ v: [1, 0, 0] });
basecase.signals('time', (v) => {
  if (!${hide} || hidden || v.time < 2) return;
  hidden = true;
  basecase.world.set('wall', { visible: false });
});
</script>`;

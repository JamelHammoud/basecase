import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { V3 } from '../../utils/kinematics';
import type { Case, WorldObject } from '../schema';
import { presetCase } from '../testing';
import { replayTry } from '../tryReplay';
import { openCodeRun } from './fixtures/codeRun';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

const object = (id: string, o: Partial<WorldObject>): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [40, 40, 40],
  color: '#888888',
  behavior: 'static',
  ...o,
});

function walledFlag(): Case {
  const kase = presetCase(robot('rover-diff'), 'reach-the-flag');
  const wall = object('wall', { position: [0, 75, 465], size: [900, 150, 40], movable: true });

  return { ...kase, world: { objects: [...kase.world.objects, wall] } };
}

const SPOTS: V3[] = [
  [150, 200, 250],
  [-150, 200, 250],
  [0, 250, 300],
  [200, 250, 150],
  [-200, 250, 150],
  [0, 300, 200],
];

function whackATarget(): Case {
  const kase = presetCase(robot('arm-6dof'), 'touch-the-dots');
  const spots = SPOTS.map((at, i) => object(`spot${i}`, { kind: 'sphere', position: at, behavior: 'marker' }));
  const lit = object('lit', { kind: 'sphere', position: [0, -400, 0], size: [44, 44, 44], behavior: 'marker' });
  const near = { atom: { expr: { signal: 'lit' }, cmp: '<' as const, value: 30, scale: 30 } };

  return {
    ...kase,
    world: { objects: [...spots, { ...lit, movable: true }] },
    reference: { timeline: [] },
    task: {
      seconds: 15,
      probes: [{ signal: 'lit', from: 'end-effector', to: { object: 'lit' } }],
      contract: { version: 1, success: { eventually: { window: 'whole', state: near } }, failures: [] },
    },
  };
}

const WHACK = `<script>
const spots = ${JSON.stringify(SPOTS)};
let hits = 0;
let lit = -1;
let armed = false;
const light = () => {
  let next = lit;
  while (next === lit) next = Math.floor(Math.random() * spots.length);
  lit = next;
  armed = false;
  basecase.world.set('lit', { pose: { position: spots[lit] }, colour: '#ff3b30' });
};
light();
basecase.signals('probe.lit', (v) => {
  const gap = v['probe.lit'];
  if (gap > 80) armed = true;
  if (!armed || gap >= 30) return;
  hits += 1;
  basecase.event('hit', hits);
  light();
});
</script>`;

function conveyor(): Case {
  const kase = presetCase(robot('arm-3dof'), 'touch-the-dots');
  const bin = object('bin', { position: [300, 50, 0], size: [200, 100, 200], behavior: 'marker' });
  const boxes = [1, 2, 3].map((n) =>
    object(`box${n}`, { position: [-400, 20, -120 * n], behavior: 'dynamic', massG: 100, movable: true }),
  );

  return {
    ...kase,
    world: { objects: [bin, ...boxes] },
    reference: { timeline: [] },
    task: {
      ...kase.task,
      seconds: 8,
      probes: boxes.map((b) => ({ signal: b.id, from: { object: b.id }, to: { object: 'bin' } })),
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'box3' }, cmp: '<', value: 60, scale: 60 } },
          },
        },
        failures: [],
      },
    },
  };
}

const BELT: V3 = [0, 21, 300];

const FEEDER = `<script>
const boxes = ['box1', 'box2', 'box3'];
let next = 0;
const feed = () => {
  if (next < boxes.length) basecase.world.set(boxes[next++], { pose: { position: ${JSON.stringify(BELT)} } });
};
feed();
basecase.signals(boxes.map((b) => 'probe.' + b), (v) => {
  if (v['probe.' + boxes[next - 1]] < 60) feed();
});
</script>`;

const ROVER = (open: boolean) => `<script>
${open ? "basecase.world.set('wall', { visible: false });" : ''}
basecase.drive({ v: [1, 0, 0] });
basecase.signals('probe.spot', (v) => { if (v['probe.spot'] < 60) basecase.drive({ v: [0, 0, 0] }); });
</script>`;

describe('code that changes the world, on the sim', () => {
  it('lights one of six spots at random, and the arm touching it scores', async () => {
    const run = await openCodeRun(mj, { robot: robot('arm-6dof'), kase: whackATarget(), html: WHACK });

    await run.step(12, () => run.engine.command({ v: [0, 0, 0], target: run.objectAt('lit') }));

    expect(run.frame.bridge.errors()).toEqual([]);

    const { recording, passed } = await run.finish();
    const lit = recording.world ?? [];

    expect(passed).toBe(true);
    expect(run.frame.log.events.filter(([name]) => name === 'hit').length).toBeGreaterThanOrEqual(3);
    expect(lit.length).toBeGreaterThanOrEqual(4);
    expect(lit.every((e) => e.color === '#ff3b30' && SPOTS.some((at) => at.join() === e.pose?.position?.join()))).toBe(
      true,
    );
  }, 60000);

  it('moves the next box onto the belt when the last one is dropped in its bin', async () => {
    const run = await openCodeRun(mj, { robot: robot('arm-3dof'), kase: conveyor(), html: FEEDER });
    const drops: number[] = [];
    const onBelt = () =>
      ['box1', 'box2', 'box3'].find((id) => Math.hypot(...run.objectAt(id).map((x, i) => x - BELT[i])) < 30);

    await run.step(7, (t) => {
      const box = onBelt();

      if (!box || t < (drops.at(-1) ?? 0) + 1) return;

      drops.push(t);
      run.world.apply({ id: box, pose: { position: [300, 150, 0] } });
    });

    const inBin = ['box1', 'box2', 'box3'].map((id) => run.objectAt(id));
    const { recording, passed } = await run.finish();
    const placed = recording.world ?? [];

    expect(passed).toBe(true);
    expect(drops).toHaveLength(3);
    expect(inBin.every(([x, , z]) => Math.abs(x - 300) < 100 && Math.abs(z) < 100)).toBe(true);
    expect(placed.map((e) => e.id)).toEqual(['box1', 'box2', 'box3']);
    expect(placed[1].at).toBeGreaterThan(drops[0]);
    expect(placed[2].at).toBeGreaterThan(drops[1]);
  }, 60000);

  it('hides a wall, and the rover then takes the route it opened', async () => {
    const outcomes = [];

    for (const open of [false, true]) {
      const run = await openCodeRun(mj, { robot: robot('rover-diff'), kase: walledFlag(), html: ROVER(open) });

      await run.step(7);
      expect(run.frame.bridge.errors()).toEqual([]);
      outcomes.push(await run.finish());
    }

    const [walled, opened] = outcomes;

    expect(walled.passed).toBe(false);
    expect(opened.passed).toBe(true);
    expect(opened.recording.world).toEqual([{ at: 0, id: 'wall', visible: false }]);
  }, 60000);

  it('gives a replay of the try the same verdict as the live try', async () => {
    const run = await openCodeRun(mj, { robot: robot('rover-diff'), kase: walledFlag(), html: ROVER(true) });

    await run.step(7);

    const scoring = run.scoring;
    const live = await run.finish();
    const replayed = await replayTry(mj, { ...scoring, recording: live.recording }, null);

    expect(replayed.passed).toBe(live.passed);
    expect(replayed.margin).toBeCloseTo(live.margin, 0);
    expect(replayed.recording.world).toEqual(live.recording.world);
  }, 60000);

  it('throttles 10,000 world calls a second to 60, with the sim still at real time', async () => {
    const run = await openCodeRun(mj, {
      robot: robot('rover-diff'),
      kase: walledFlag(),
      html: `<script>
        for (let i = 0; i < 10000; i++) basecase.world.set('wall', { pose: { position: [i % 400, 75, 465] } });
      </script>`,
    });
    const wall = performance.now();

    await run.step(1);

    const took = (performance.now() - wall) / 1000;
    const { recording } = await run.finish();

    expect(recording.world?.length).toBeLessThanOrEqual(60);
    expect(recording.world?.length).toBeGreaterThan(0);
    expect(run.frame.bridge.errors()).toContain('world refused: more than 60 calls a second');
    expect(took).toBeLessThan(1);
  }, 60000);

  it('refuses to move a fixed object or the robot from code', async () => {
    const rover = robot('rover-diff');
    const run = await openCodeRun(mj, {
      robot: rover,
      kase: walledFlag(),
      html: `<script>
        basecase.world.set('spot', { pose: { position: [0, 40, 0] } });
        basecase.world.set('${rover.parts[0].id}', { pose: { position: [0, 400, 0] } });
        basecase.world.set('wall', { pose: { position: [NaN, 75, 465] } });
      </script>`,
    });

    await run.step(0.2);

    const { recording } = await run.finish();

    expect(recording.world).toBeUndefined();
    expect(run.frame.bridge.errors()).toEqual([
      'world refused: spot isn’t movable',
      `world refused: ${rover.parts[0].id} isn’t in the Case’s world`,
      'sent a malformed world message',
    ]);
  }, 60000);
});

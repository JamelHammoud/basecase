import loadMujoco from '@mujoco/mujoco';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { WorldChange } from '../../sim/worldLooks';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../../utils/sceneFile';
import { CASE_STORE_MAX_BYTES } from '../caseStore';
import { parseCase, readCases, type Case } from '../schema';
import { replayTry } from '../tryReplay';
import type { BridgeTools } from './codeBridgeTools';
import { WORLD_CALLS_PER_SECOND } from './codeWorld';
import { openTestFrame, type TestFrame } from './fixtures/codeFrames';
import { liveCodeTry } from './fixtures/liveCode';
import { whackCase } from './fixtures/worldApps';
import { createSignalBus } from './signalBus';

const opened: TestFrame[] = [];

afterEach(() => opened.splice(0).forEach((f) => f.close()));

function open(source: string, tools: BridgeTools) {
  const frame = openTestFrame(source, {
    bus: createSignalBus(),
    scope: { declared: new Set(), probes: new Set(), inputs: new Set(['code']) },
    tools,
  });

  opened.push(frame);

  return frame;
}

function worldTools(kase: Case) {
  const applied: WorldChange[] = [];

  return {
    applied,
    tools: { world: { objects: () => kase.world.objects, set: (c: WorldChange) => void applied.push(c) } },
  };
}

const script = (body: string) => `<script>\n${body}\n</script>`;

describe('the bridge’s world, store and frames calls', () => {
  it('refuses moving an object that isn’t movable, the robot or a missing name, and moves a movable one', async () => {
    const { applied, tools } = worldTools(whackCase());
    const frame = open(
      script(`
basecase.world.set('spot1', { pose: { position: [0, 0, 0] } });
basecase.world.set('link2', { pose: { position: [0, 0, 0] } });
basecase.world.set('ghost', { visible: false });
basecase.world.set('target', { pose: { position: [0, 60, 120] }, colour: '#FF5A1F' });`),
      tools,
    );

    await vi.waitFor(() => expect(frame.bridge.report().refused).toHaveLength(3));
    expect(frame.bridge.report().refused).toEqual([
      'world.set refused: spot1 isn’t movable',
      'world.set refused: names link2, which isn’t in the Case’s world',
      'world.set refused: names ghost, which isn’t in the Case’s world',
    ]);
    expect(applied).toEqual([{ id: 'target', position: [0, 60, 120], color: '#ff5a1f' }]);
  });

  it('refuses NaN and infinite poses, colours that aren’t hex and empty changes', async () => {
    const { applied, tools } = worldTools(whackCase());
    const frame = open(
      script(`
basecase.world.set('target', { pose: { position: [NaN, 0, 0] } });
basecase.world.set('target', { pose: { rotation: [0, Infinity, 0] } });
basecase.world.set('target', { colour: 'red; background: url(x)' });
basecase.world.set('target', {});`),
      tools,
    );

    await vi.waitFor(() => expect(frame.bridge.report().refused).toHaveLength(4));
    expect(new Set(frame.bridge.report().refused)).toEqual(new Set(['sent a malformed world message']));
    expect(applied).toEqual([]);
  });

  it('throttles 10,000 world calls a second to 60 while the sim keeps real time', { timeout: 60_000 }, async () => {
    const mj = await loadMujoco();
    const { recording, seconds, run } = await liveCodeTry({
      mj,
      kase: whackCase(),
      robot: fixtureRobots().find((r) => r.id === 'arm-3dof')!,
      seconds: 2,
      source: script(`
basecase.signals('time', () => {
  for (let i = 0; i < 500; i++) basecase.world.set('target', { pose: { position: [0, 60 + (i % 50), 120] } });
});`),
    });
    const started = performance.now();
    const replayed = await replayTry(mj, { ...run.scoring, recording }, null);
    const wall = (performance.now() - started) / 1000;

    expect(recording.world?.length).toBeLessThanOrEqual(WORLD_CALLS_PER_SECOND * Math.ceil(seconds));
    expect(recording.world?.length).toBeGreaterThan(WORLD_CALLS_PER_SECOND);
    expect(run.frame.bridge.report().refused).toContain(
      `world.set refused: more than ${WORLD_CALLS_PER_SECOND} calls a second`,
    );
    expect(replayed.recording.world).toEqual(recording.world);
    expect(wall).toBeLessThan(seconds);
    run.engine.dispose();
  });

  it('refuses a 1 MB store write and keeps what was stored', async () => {
    let store: Record<string, unknown> | undefined = { best: 3 };
    const frame = open(
      script(`
basecase.store.set('blob', 'x'.repeat(1000000)).then((reply) => basecase.event('blob', reply.problem));
basecase.store.get('best').then((best) => basecase.event('best', best));`),
      { store: { read: () => store, write: (next) => (store = next) } },
    );

    await vi.waitFor(() => expect(frame.log.events).toHaveLength(2));
    expect(Object.fromEntries(frame.log.events)).toEqual({
      best: 3,
      blob: `The store holds 977 KB, over ${CASE_STORE_MAX_BYTES / 1024} KB.`,
    });
    expect(store).toEqual({ best: 3 });
    expect(() => parseCase({ ...whackCase(), store: { blob: 'x'.repeat(1_000_000) } })).toThrow(
      'store holds 977 KB, over 64 KB',
    );
  });

  it('keeps a high score in the Case through a scene reload', async () => {
    let project = { cases: [whackCase()] as unknown[] };
    const tools = (): BridgeTools => ({
      store: {
        read: () => readCases(project.cases)[0].store,
        write: (store) => (project = { cases: [{ ...readCases(project.cases)[0], store }] }),
      },
    });
    const first = open(script(`basecase.store.set('best', 7).then(() => basecase.event('saved'));`), tools());

    await vi.waitFor(() => expect(first.log.events).toEqual([['saved', true]]));
    first.close();

    const file = await encodeSceneFile(sharedScene({ name: 'Whack', parts: [], project } as never));
    const reloaded = await decodeSceneFile(file);

    project = { cases: reloaded.project?.cases ?? [] };

    const second = open(script(`basecase.store.get('best').then((best) => basecase.event('best', best));`), tools());

    await vi.waitFor(() => expect(second.log.events).toEqual([['best', 7]]));
  });
});

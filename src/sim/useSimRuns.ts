import { useRef } from 'react';
import type { SimModel } from './mjcfTypes';
import { simDeltas } from './mjcfFrames';
import type { Controller } from './engine';
import type { SimRequest, SimResponse } from './sim.worker';
import type { FallPlan, FallRun } from './fallRuns';
import type { RunOptions, SceneModelOptions, SimRun } from './useSimulation';
import { newSimWorker } from './useSimWorker';

type Ran = Extract<SimResponse, { type: 'ran' }>;

interface OneShot<T> {
  controller: Controller;
  ask: (robot: string) => SimRequest;
  answer: (msg: SimResponse) => T | undefined;
}

async function oneShot<T>(m: SimModel, { controller, ask, answer }: OneShot<T>): Promise<T> {
  const w = newSimWorker();

  try {
    return await new Promise<T>((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<SimResponse>) => {
        const msg = ev.data;
        const done = answer(msg);

        if (msg.type === 'ready') w.postMessage(ask(m.robots.find((r) => r.floating)?.key ?? m.robots[0]?.key ?? ''));
        else if (msg.type === 'error') reject(new Error(msg.message));
        else if (done !== undefined) resolve(done);
      };
      w.onerror = (e) => reject(new Error(e.message || 'The simulator stopped.'));
      w.postMessage({ type: 'load', model: m, controller } satisfies SimRequest);
    });
  } finally {
    w.terminate();
  }
}

async function runModel(
  m: SimModel,
  { seconds, controller, pushes, frames, forceLimits, trace, currents, commands }: RunOptions,
  id: number,
): Promise<SimRun> {
  const result = await oneShot<Ran>(m, {
    controller,
    ask: (key) => ({
      type: 'run',
      id,
      seconds,
      frames,
      pushes: pushes?.map((p) => ({ at: p.at, robot: p.robot ?? key, force: p.force })),
      forceLimits: forceLimits?.(m),
      trace,
      currents,
      commands,
    }),
    answer: (msg) => (msg.type === 'ran' ? msg : undefined),
  });

  return {
    stats: result.stats,
    frames: result.frames.map((f) => ({ t: f.t, deltas: simDeltas(m, f.poses), poses: f.poses })),
    model: m,
    trace: result.trace,
  };
}

export const fallsOn = (m: SimModel, plan: (model: SimModel, robot: string) => FallPlan, id: number) =>
  oneShot<FallRun[]>(m, {
    controller: { kind: 'hold' },
    ask: (robot) => ({ type: 'falls', id, ...plan(m, robot) }),
    answer: (msg) => (msg.type === 'fell' ? msg.runs : undefined),
  });

export function useSimRuns(buildModel: (options?: SceneModelOptions) => Promise<SimModel>) {
  const runSeq = useRef(0);
  const runOn = (model: SimModel, options: RunOptions) => runModel(model, options, ++runSeq.current);

  return {
    runOn,
    run: async (options: RunOptions) => runOn(await buildModel(), options),
    falls: async (plan: (model: SimModel, robot: string) => FallPlan) => {
      const model = await buildModel();

      return { model, runs: await fallsOn(model, plan, ++runSeq.current) };
    },
  };
}

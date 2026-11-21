import { LiveCase } from '../cases/liveCase';
import { isHash } from '../skills/hash';
import { assertTeaching } from './teaching';
import type { SimEngine } from './engine';
import type { TeachingStart } from './teachingLink';

export class LiveTeaching {
  startedAt = 0;
  private deadline: number | null = null;

  async start(engine: SimEngine, input: TeachingStart, recording: boolean) {
    if (recording || input.input.plan || !isHash(input.skill))
      throw new Error('Choose a Case without controller logic.');

    assertTeaching({ controller: input.controller, setup: input.setup, sim: engine.sim }, engine.dt);
    engine.setController(input.controller);
    engine.startTeaching(input.setup);
    engine.teachingSource()!.source.skill = input.skill;

    const live = await LiveCase.start(engine, input.input, () => input.controller);
    const seconds = Math.ceil(input.input.kase.task.seconds / engine.dt - 1e-9) * engine.dt;

    live.limit(seconds);
    this.startedAt = engine.data.time;
    this.deadline = this.startedAt + seconds;

    return live;
  }

  seconds(engine: SimEngine, seconds: number) {
    return this.deadline === null ? seconds : Math.min(seconds, Math.max(0, this.deadline - engine.data.time));
  }

  expired(engine: SimEngine) {
    return this.deadline !== null && engine.data.time >= this.deadline - 1e-9;
  }

  reset() {
    this.deadline = null;
  }
}

export async function handleTeaching(input: {
  engine: SimEngine | null;
  msg: Extract<import('./simMessages').SimRequest, { type: 'teaching' }>;
  session: LiveTeaching;
  recording: boolean;
  start: (
    value: LiveCase,
    message: Extract<import('./simMessages').SimRequest, { type: 'teaching'; phase: 'start' }>,
  ) => void;
  post: (message: import('./simMessages').SimResponse) => void;
}) {
  const { engine, msg, session, post } = input;

  try {
    if (!engine) throw new Error('Nothing loaded');

    if (msg.phase === 'start') input.start(await session.start(engine, msg, input.recording), msg);

    if (msg.phase === 'handoff' && input.recording) engine.handoff(msg.owner);

    post({
      type: 'teaching',
      id: msg.id,
      owner: engine.teachingSource()?.owner ?? null,
      startedAt: session.startedAt,
      problem: null,
    });
  } catch (error) {
    post({
      type: 'teaching',
      id: msg.id,
      owner: null,
      startedAt: session.startedAt,
      problem: error instanceof Error ? error.message : String(error),
    });
  }
}

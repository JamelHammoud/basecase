import type { Series, SignalBus } from '../../../cases/console/signalBus';
import { isTopicSignal } from '../../../topics/topicIndex';

interface Held {
  times: ArrayLike<number>;
  values: number[];
}

const heldCache = new WeakMap<Series, Held>();

export function heldOn(source: Series, times: ArrayLike<number>): number[] {
  const values = new Array<number>(times.length);
  let k = -1;

  for (let i = 0; i < times.length; i++) {
    while (k + 1 < source.t.length && source.t[k + 1] <= times[i]) k++;

    values[i] = k < 0 ? Number.NaN : source.v[k];
  }

  return values;
}

function heldOnFrames(source: Series, frames: ArrayLike<number>): number[] {
  const kept = heldCache.get(source);

  if (kept?.times === frames) return kept.values;

  const values = heldOn(source, frames);

  heldCache.set(source, { times: frames, values });

  return values;
}

const sameTimes = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a === b) return true;

  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;

  return true;
};

export const pairedX = (x: Series, y: Series): number[] => (sameTimes(x.t, y.t) ? x.v : heldOn(x, y.t));

export const frameTimes = (bus: Pick<SignalBus, 'series'>) => bus.series('time').t;

export function onFrames(bus: Pick<SignalBus, 'series'>, id: string): number[] {
  const frames = frameTimes(bus);
  const series = bus.series(id);

  return isTopicSignal(id) && frames.length ? heldOnFrames(series, frames) : series.v;
}

export const sampleTotal = (bus: Pick<SignalBus, 'series'>, ids: readonly string[]) =>
  ids.reduce((n, id) => n + bus.series(id).t.length, 0);

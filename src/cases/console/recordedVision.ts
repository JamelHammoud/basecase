import { lastAtOrBefore } from '../../dataLayers/track';
import type { VisionResult } from '../../vision/protocol';
import type { RecordedBus } from './recordedSignals';
import type { Series } from './signalBus';
import { matches } from './signalNames';
import { visionSignalValues } from './visionSignals';

export interface RecordedVisionBus extends RecordedBus {
  see: (result: VisionResult) => void;
}

export function recordedVisionBus(bus: RecordedBus, mediaSource: string | undefined): RecordedVisionBus {
  const columns = new Map<string, Map<number, number>>();
  const cached = new Map<string, Series>();
  const listeners = new Set<() => void>();
  let version = 0;

  const series = (id: string): Series => {
    if (!id.startsWith('vision.')) return bus.series(id);

    const known = cached.get(id);

    if (known) return known;

    const values = new Array<number>(bus.track.t.length).fill(Number.NaN);

    columns.get(id)?.forEach((value, frame) => {
      values[frame] = value;
    });

    const made = { t: bus.track.t, v: values };

    cached.set(id, made);

    return made;
  };

  return {
    ...bus,
    read: (id) => (id.startsWith('vision.') ? columns.get(id)?.get(bus.frame()) : bus.read(id)),
    series,
    expand: (pattern) =>
      pattern.startsWith('vision.') ? [...columns.keys()].filter((id) => matches(pattern, id)) : bus.expand(pattern),
    version: () => bus.version() + version,
    subscribe(listen) {
      listeners.add(listen);

      const stop = bus.subscribe(listen);

      return () => {
        stop();
        listeners.delete(listen);
      };
    },
    see(result) {
      if (!mediaSource || result.mediaSource !== mediaSource || result.mediaTime === undefined) return;

      const frame = lastAtOrBefore(bus.track.t, result.mediaTime + 0.0001);

      if (frame < 0 || Math.abs(bus.track.t[frame] - result.mediaTime) > 0.001) return;

      const values = visionSignalValues([result], result.timestamp);

      for (const [id, value] of Object.entries(values)) {
        const column = columns.get(id) ?? new Map<number, number>();

        column.set(frame, value);
        columns.set(id, column);
        cached.delete(id);
      }

      version++;
      listeners.forEach((listen) => listen());
    },
  };
}

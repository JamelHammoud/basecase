import { loadManifests, loadRecording } from '../cases/tryStore';
import type { StoredTry } from '../cases/tryFile';
import type { Recording } from '../sim/recorder';
import type { SeedReplay } from '../cases/seedReplay';

export type TimelineSource = (() => boolean) | { current: () => boolean; recording: Recording; stored: StoredTry };
export const timelineSourceCurrent = (source: TimelineSource) =>
  typeof source === 'function' ? source : source.current;

export function readTimelineSource(id: string, seeded: SeedReplay | undefined, source: TimelineSource) {
  const verified = typeof source === 'function' ? null : source;

  return Promise.all([
    verified?.recording ?? seeded?.recording ?? loadRecording(id),
    verified ? [verified.stored] : loadManifests([id]),
  ]);
}

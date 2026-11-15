import type { TryFramePick, TryFrameSelection } from './tryFramesTypes';

interface SelectionSource {
  stored: { id: string; frames: number; rate: number };
  recording: { frames: number; t: Float32Array } | null;
}

const whole = (value: number, min = 0) => Number.isSafeInteger(value) && value >= min;
const refuse = (): never => {
  throw new Error('Choose frames within the try.');
};
const frameCount = (source: SelectionSource) => source.recording?.frames ?? source.stored.frames;

function indexes(frames: number, selection: Exclude<TryFrameSelection, { kind: 'sample' }>): number[] {
  if (selection.kind === 'frame') return singleIndex(frames, selection.frame);

  const from = selection.from ?? 0;
  const to = selection.to ?? frames - 1;
  const step = selection.step ?? 1;

  if (!whole(from) || !whole(to) || !whole(step, 1) || to < from || to >= frames) refuse();

  const count = Math.floor((to - from) / step) + 1;

  if (count > 1000) throw new Error('Choose up to 1000 frames.');

  return Array.from({ length: count }, (_, i) => from + i * step);
}

function singleIndex(frames: number, frame: number): number[] {
  if (!whole(frame) || frame >= frames) refuse();

  return [frame];
}

function sampleCounts(tries: SelectionSource[], count: number): number[] {
  if (!whole(count, 1) || count > 1000) throw new Error('Choose from 1 to 1000 frames.');

  const counts = tries.map(() => 0);
  const available = tries.reduce((sum, source) => sum + frameCount(source), 0);

  if (count > available) throw new Error('Choose fewer frames from these tries.');

  for (let chosen = 0; chosen < count;) {
    for (let i = 0; i < tries.length && chosen < count; i++) {
      if (counts[i] >= frameCount(tries[i])) continue;

      counts[i]++;
      chosen++;
    }
  }

  return counts;
}

function sampledIndexes(frames: number, count: number): number[] {
  if (count === 1) return [Math.floor((frames - 1) / 2)];

  return Array.from({ length: count }, (_, i) => Math.round((i * (frames - 1)) / (count - 1)));
}

function pick(source: SelectionSource, tryIndex: number, frame: number): TryFramePick {
  const seconds = source.recording ? source.recording.t[frame] : frame / source.stored.rate;

  if (!Number.isFinite(seconds) || seconds < 0) refuse();

  return { tryIndex, frame, seconds };
}

export function selectTryFrames(tries: SelectionSource[], selection: TryFrameSelection): TryFramePick[] {
  if (!tries.length || new Set(tries.map((source) => source.stored.id)).size !== tries.length) refuse();

  if (
    tries.some(
      (source) => !whole(frameCount(source), 1) || !Number.isFinite(source.stored.rate) || source.stored.rate <= 0,
    )
  )
    refuse();

  const counts = selection.kind === 'sample' ? sampleCounts(tries, selection.count) : [];
  const selected = tries.flatMap((source, tryIndex) => {
    const frames = frameCount(source);
    const chosen = selection.kind === 'sample' ? sampledIndexes(frames, counts[tryIndex]) : indexes(frames, selection);

    return chosen.map((frame) => pick(source, tryIndex, frame));
  });

  if (selected.length > 1000) throw new Error('Choose up to 1000 frames.');

  return selected;
}

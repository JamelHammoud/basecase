import { encodeTopicLog } from '../../topics/topicFile';
import type { JointSample, Read } from './recordingRead';
import { MCAP_TOO_MANY_JOINTS } from './ros2Cdr';
import { DataImportError, IMPORT_LIMITS, type SourceData, type SourceEpisode, type SourceVideo } from './types';

export const MCAP_GRID_HZ = 50;

const NS_PER_SECOND = 1e9;

const seconds = (ns: bigint) => Number(ns) / NS_PER_SECOND;

function jointIndex(samples: JointSample[]) {
  const index = new Map<string, number>();

  for (const sample of samples) {
    for (const name of sample.names) {
      if (index.has(name)) continue;

      if (index.size === IMPORT_LIMITS.joints) throw new DataImportError(MCAP_TOO_MANY_JOINTS);

      index.set(name, index.size);
    }
  }

  return index;
}

function jointSeries(samples: JointSample[], index: Map<string, number>, start: bigint) {
  const series = Array.from({ length: index.size }, () => ({ times: [] as number[], values: [] as number[] }));

  for (const sample of samples) {
    const time = seconds(sample.ns - start);

    sample.names.forEach((name, i) => {
      const column = index.get(name);

      if (column === undefined) return;

      series[column].times.push(time);
      series[column].values.push(sample.position[i]);
    });
  }

  return series;
}

function interpolate(times: number[], values: number[], at: number, i: number) {
  if (at <= times[i] || i === times.length - 1) return values[i];

  const fraction = (at - times[i]) / (times[i + 1] - times[i]);

  return values[i] + (values[i + 1] - values[i]) * fraction;
}

function resampleJoint(joint: { times: number[]; values: number[] }, grid: Float64Array) {
  const out = new Float64Array(grid.length);
  const last = joint.times.length - 1;
  let i = 0;

  for (let k = 0; k < grid.length; k++) {
    while (i < last && joint.times[i + 1] <= grid[k]) i++;

    out[k] = interpolate(joint.times, joint.values, grid[k], i);
  }

  return out;
}

function timeGrid(spanNs: bigint) {
  const frames = Math.floor(seconds(spanNs) * MCAP_GRID_HZ + 1e-6) + 1;

  return Float64Array.from({ length: frames }, (_, k) => k / MCAP_GRID_HZ);
}

function videosOf(recording: Read): SourceVideo[] {
  return [...recording.images].map(([camera, topic]) => ({
    camera,
    path: topic.path,
    from: seconds(topic.first - recording.first),
    to: seconds(topic.last - recording.first),
    frames: topic.frames,
  }));
}

const sortedSamples = (recording: Read) => [...recording.joints].sort((a, b) => Number(a.ns - b.ns));

function episodeOf(recording: Read, index: Map<string, number>): SourceEpisode {
  const series = jointSeries(sortedSamples(recording), index, recording.first);
  const t = timeGrid(recording.last - recording.first);
  const state = new Float64Array(t.length * index.size);

  series.forEach((joint, column) => {
    resampleJoint(joint, t).forEach((value, frame) => {
      state[frame * index.size + column] = value;
    });
  });

  return {
    index: 0,
    task: null,
    t,
    state,
    action: null,
    videos: videosOf(recording),
    topics: recording.topics.topics.length ? encodeTopicLog(recording.topics) : null,
  };
}

export function recordingSource(recording: Read): SourceData {
  const index = jointIndex(sortedSamples(recording));

  return { format: 'mcap', robotType: null, names: [...index.keys()], episodes: [episodeOf(recording, index)] };
}

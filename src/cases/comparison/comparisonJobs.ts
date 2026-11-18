import { preparePlot } from './comparisonPlots';
import { reply } from '../../utils/workerRpc';
import { comparisonMessage } from './comparisonMessages';
import { comparisonImageSession } from './comparisonImages';
import { comparisonSpatialImageSession } from './comparisonSpatialImage';
import { DATA_LAYER_SCHEMAS, IMAGE_SCHEMAS, schemaKey } from '../../topics/schemas';
import type { StoredTry } from '../tryFile';
import {
  COMPARISON_LIMITS,
  prepareSource,
  sampleChannel,
  type ComparisonSource,
  type SamplingRule,
  type ComparisonChannel,
} from './comparison';

export type SourceInfo = ReturnType<typeof sourceInfo>;

function snapshotSample(channel: ComparisonChannel, time: number, rule: SamplingRule) {
  const sample = sampleChannel(channel, time, rule);

  if (typeof sample.value !== 'string' || sample.value.length <= COMPARISON_LIMITS.text)
    return { id: channel.id, ...sample };

  return { id: channel.id, ...sample, value: sample.value.slice(0, COMPARISON_LIMITS.text), clipped: true };
}

function sourceInfo(source: ComparisonSource) {
  const { stored, hash, bytes, start, end, events, eventsClipped, stateEventsClipped, channelsClipped } = source;

  return {
    stored,
    hash,
    bytes,
    start,
    end,
    events,
    eventsClipped,
    stateEventsClipped,
    channelsClipped,
    channels: source.channels.map(({ id, unit, kind, clipped, t }) => ({
      id,
      unit,
      kind,
      clipped,
      start: t[0],
      end: t[t.length - 1],
    })),
    topics: source.index.topics.map(({ topic, schema, clipped }) => ({ topic, schema, clipped })),
    cameras: [
      ...new Set([
        ...source.index.topics
          .filter(
            (topic) =>
              IMAGE_SCHEMAS.has(schemaKey(topic.schema)) && (topic.blobs.has('data') || topic.lists.has('data')),
          )
          .map((topic) => topic.topic),
        ...(stored.videos ?? []).filter((video) => !/\.(mcap|bag)$/iu.test(video.path)).map((video) => video.camera),
      ]),
    ],
    spatial: source.index.topics
      .filter((topic) => DATA_LAYER_SCHEMAS.has(schemaKey(topic.schema)))
      .map((topic) => topic.topic),
  };
}

export function comparisonJobs() {
  let source: ComparisonSource | null = null;
  const images = comparisonImageSession();
  const spatial = comparisonSpatialImageSession();

  const opened = () => {
    if (!source) throw new Error('Open the try again.');

    return source;
  };

  return {
    async open(payload: { stored: StoredTry; bytes: Uint8Array }) {
      images.close();
      spatial.close();
      source = await prepareSource(payload);

      return reply(sourceInfo(source));
    },
    async image({ camera, time, rule }: { camera: string; time: number; rule: SamplingRule }) {
      const result = await images.read(opened(), camera, time, rule);

      return reply(result, result.bitmap ? [result.bitmap] : []);
    },
    async spatial({ topic, time }: { topic: string; time: number }) {
      const result = await spatial.read(opened(), topic, time);

      return reply(result, result.bitmap ? [result.bitmap] : []);
    },
    plot({ id, rule }: { id: string; rule: SamplingRule }) {
      const channel = opened().channels.find((candidate) => candidate.id === id);

      return reply(channel?.kind === 'number' ? preparePlot(channel, rule) : { t: [], v: [] });
    },
    seek({ time, rule, topic }: { time: number; rule: SamplingRule; topic: string }) {
      const current = opened();

      return reply({
        time,
        samples: current.channels.map((channel) => snapshotSample(channel, time, rule)),
        message: comparisonMessage(current, topic, time),
      });
    },
  };
}

export type ComparisonJobs = ReturnType<typeof comparisonJobs>;
export type SourceSnapshot = Awaited<ReturnType<ComparisonJobs['seek']>>['result'];

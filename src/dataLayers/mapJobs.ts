import type { MapWorldRequest } from './mapWorld';
import { reply } from '../utils/workerRpc';
import { decodeTopicLog } from '../topics/topicFile';
import { TopicIndex } from '../topics/topicIndex';
import { ScanMap, type MapOptions } from './map';
import { topicMap } from './mapFeed';
import type { MapCloud } from './messages';
import { addSceneHits, simMap, type SimScans } from './simMap';
import type { VoxelChanges } from './voxels';

export interface TryMapInput {
  topics?: Uint8Array | null;
  sim?: SimScans | null;
  options?: MapOptions;
}

export interface LiveGrowth extends VoxelChanges {
  count: number;
}

function topicIndex(bytes: Uint8Array | null | undefined): TopicIndex | null {
  const log = bytes ? decodeTopicLog(bytes) : null;

  return log?.topics.length ? new TopicIndex(log) : null;
}

export function buildTryMap({ topics, sim, options }: TryMapInput): MapCloud | null {
  const index = topicIndex(topics);
  const built = (index && topicMap(index, options)) || (sim ? simMap(sim, options) : null);

  return built && built.cloud.points.length ? built.cloud : null;
}

export function mapJobs() {
  const live = new Map<number, ScanMap>();

  return {
    makeWorld: async (input: MapWorldRequest) => {
      const [{ reconstructMapWorld }, { prepareMeshWorld }] = await Promise.all([
        import('./mapWorld'),
        import('../cases/worldImportOps'),
      ]);
      const asset = await reconstructMapWorld(input);

      return prepareMeshWorld(asset.world, asset.pieces);
    },
    tryMap: (input: TryMapInput) => {
      const cloud = buildTryMap(input);

      return reply(cloud, cloud ? [cloud.points.buffer] : []);
    },
    liveHits: ({ session, hits }: { session: number; hits: Float32Array }) => {
      const map = live.get(session) ?? new ScanMap({ match: false, trackChanges: true });

      live.set(session, map);
      addSceneHits(map, hits);

      const { indices, points } = map.voxels.takeChanges();

      return reply<LiveGrowth>({ count: map.count, indices, points }, [indices.buffer, points.buffer]);
    },
    liveEnd: ({ session }: { session: number }) => reply(live.delete(session)),
  };
}

export type MapJobs = ReturnType<typeof mapJobs>;

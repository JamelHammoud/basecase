import { refuse } from '../cases/validate';
import type { WorldAsset } from '../cases/worldAssets';
import { decodeTopicLog } from '../topics/topicFile';
import { schemaKey } from '../topics/schemas';
import { TopicIndex } from '../topics/topicIndex';
import type { RecordedTopic } from '../topics/topicLog';
import { topicMap } from './mapFeed';
import { isDepth } from './mapSweeps';
import { boxHull, boxesMesh, mergeCells, type CellBox } from './mapWorldBoxes';
import { cellKey, MapWorldCells, RECONSTRUCTION_M } from './mapWorldCells';

export interface MapWorldRequest {
  topics: Uint8Array;
  sourceTry: string;
  name: string;
  matching: boolean;
  maxPieces?: number;
}

const MAPPING_SCHEMAS = new Set([
  'sensor_msgs/LaserScan',
  'sensor_msgs/PointCloud2',
  'sensor_msgs/CameraInfo',
  'tf2_msgs/TFMessage',
  'nav_msgs/Odometry',
]);

function clippedMappingTopic(topic: RecordedTopic): boolean {
  if (!topic.clipped) return false;

  const schema = schemaKey(topic.schema);

  if (schema !== 'sensor_msgs/Image') return MAPPING_SCHEMAS.has(schema);

  const encodings = topic.labels.get('encoding');

  return !encodings?.length || encodings.some((encoding) => !encoding || isDepth({ encoding }));
}

function planarPieces(cells: MapWorldCells, limit: number) {
  const walls = new Set([...cells.occupied].map((key) => cellKey([...key.split(',').slice(0, 2).map(Number), 0])));
  const floor = new Set([...cells.free].map((key) => cellKey([...key.split(',').slice(0, 2).map(Number), 0])));

  for (const key of walls) floor.delete(key);

  const wallBoxes = mergeCells(walls, limit).map(({ min, max }) => ({
    min: [(min[0] - 0.5) * 100, 0, -(max[1] + 0.5) * 100],
    max: [(max[0] + 0.5) * 100, 1000, -(min[1] - 0.5) * 100],
  }));
  const floorBoxes = mergeCells(floor, limit - wallBoxes.length).map(({ min, max }) => ({
    min: [(min[0] - 0.5) * 100, -100, -(max[1] + 0.5) * 100],
    max: [(max[0] + 0.5) * 100, 0, -(min[1] - 0.5) * 100],
  }));

  return [...wallBoxes, ...floorBoxes].map(boxHull);
}

function measuredPieces(cells: MapWorldCells, limit: number) {
  const boxes = mergeCells(cells.occupied, limit);
  const floor = Math.min(...boxes.map(({ min }) => min[2]));
  const sceneBox = ({ min, max }: CellBox): CellBox => ({
    min: [(min[0] - 0.5) * 100, (min[2] - 1 - floor) * 100, -(max[1] + 0.5) * 100],
    max: [(max[0] + 0.5) * 100, (max[2] - floor) * 100, -(min[1] - 0.5) * 100],
  });

  return {
    pieces: boxes.map((box) => boxHull(sceneBox(box))),
    translation: [0, -(floor + 0.5) * 100, 0] as [number, number, number],
  };
}

export async function reconstructMapWorld(request: MapWorldRequest): Promise<WorldAsset> {
  const { topics, matching, sourceTry, name } = request;
  const limit = request.maxPieces ?? 64;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64)
    refuse('Scan reconstruction', 'needs a pieces budget from 1 to 64');

  const log = decodeTopicLog(topics);

  if (!log) return refuse('Scan reconstruction', 'needs recorded scan topics');

  if (log.topics.some(clippedMappingTopic)) return refuse('Scan reconstruction', 'needs unclipped recorded topics');

  const cells = new MapWorldCells();
  const built = topicMap(new TopicIndex(log), { match: matching }, cells.add);

  if (!built || !cells.occupied.size) return refuse('Scan reconstruction', 'needs connected recorded scan samples');

  const evidence = cells.evidence();
  const geometry = cells.planar
    ? { pieces: planarPieces(cells, limit), translation: [0, 0, 0] as [number, number, number] }
    : measuredPieces(cells, limit);
  const { pieces, translation } = geometry;

  return {
    world: {
      kind: 'mesh',
      name,
      mesh: boxesMesh(pieces),
      transform: { scale: 1000, quaternion: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], translation },
      reconstruction: {
        version: 1,
        sourceTry,
        frame: built.cloud.frame,
        matching,
        resolutionM: RECONSTRUCTION_M,
        method: 'occupied-voxels',
        unknown: 'unobserved',
        ...evidence,
        estimates: { floor: cells.planar, obstacleHeightM: cells.planar ? 1 : null },
      },
    },
    pieces,
  };
}

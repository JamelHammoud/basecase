import { messageAt } from '../topics/messageTree';
import { schemaKey } from '../topics/schemas';
import type { TopicIndex } from '../topics/topicIndex';
import type { RecordedTopic } from '../topics/topicLog';
import type { MapOptions } from './map';
import type { LaserScan, MapCloud, Odometry, PointCloud2, TFMessage } from './messages';
import { MapSession, bareFrame, type PlacedSweep } from './mapSession';
import {
  cloudSweep,
  depthSweep,
  intrinsicsOf,
  isDepth,
  scanSweep,
  type DepthImage,
  type Intrinsics,
} from './mapSweeps';

interface Sensor {
  topic: RecordedTopic;
  optical: boolean;
  read: (i: number) => { frame: string; points: Float32Array };
}

const bare = bareFrame;

const decoded = <T>(topic: RecordedTopic, i: number) => messageAt(topic, i) as unknown as T;

const topicsOf = (index: TopicIndex, schema: string) => index.topics.filter((t) => schemaKey(t.schema) === schema);

const folder = (topic: string) => topic.slice(0, topic.lastIndexOf('/'));

function lensFor(index: TopicIndex, image: RecordedTopic, frame: string): Intrinsics | null {
  const infos = topicsOf(index, 'sensor_msgs/CameraInfo').filter((t) => t.t.length > 0);
  const info = infos.find((t) => folder(t.topic) === folder(image.topic)) ?? infos.find((t) => frameOf(t) === frame);

  if (!info) return null;

  const first = decoded<{ k?: ArrayLike<number>; K?: ArrayLike<number> }>(info, 0);

  return intrinsicsOf(first.k ?? first.K);
}

const frameOf = (topic: RecordedTopic) => bare(decoded<{ header?: { frame_id?: string } }>(topic, 0).header?.frame_id);

function depthSensor(index: TopicIndex, topic: RecordedTopic): Sensor | null {
  if (!topic.t.length || !isDepth(decoded<DepthImage>(topic, 0))) return null;

  const lens = lensFor(index, topic, frameOf(topic));

  if (!lens) return null;

  return {
    topic,
    optical: true,
    read: (i) => {
      const image = decoded<DepthImage & { header: { frame_id: string } }>(topic, i);

      return { frame: bare(image.header?.frame_id), points: depthSweep(image, lens) };
    },
  };
}

function sensorsOf(index: TopicIndex): Sensor[] {
  const scans = topicsOf(index, 'sensor_msgs/LaserScan').map((topic) => ({
    topic,
    optical: false,
    read: (i: number) => {
      const scan = decoded<LaserScan>(topic, i);

      return { frame: bare(scan.header?.frame_id), points: scanSweep(scan) };
    },
  }));
  const clouds = topicsOf(index, 'sensor_msgs/PointCloud2').map((topic) => ({
    topic,
    optical: false,
    read: (i: number) => {
      const cloud = decoded<PointCloud2>(topic, i);

      return { frame: bare(cloud.header?.frame_id), points: cloudSweep(cloud) };
    },
  }));
  const depths = topicsOf(index, 'sensor_msgs/Image').flatMap((t) => depthSensor(index, t) ?? []);

  return [...scans, ...clouds, ...depths];
}

function feedFrames(index: TopicIndex, session: MapSession) {
  for (const topic of topicsOf(index, 'tf2_msgs/TFMessage')) {
    const fixed = topic.topic.endsWith('_static');

    for (let i = 0; i < topic.t.length; i++)
      session.message('tf2_msgs/TFMessage', decoded<TFMessage>(topic, i), { at: topic.t[i], fixed });
  }

  for (const topic of topicsOf(index, 'nav_msgs/Odometry'))
    for (let i = 0; i < topic.t.length; i++) session.odometry(decoded<Odometry>(topic, i), topic.t[i]);
}

interface Reading {
  at: number;
  sensor: Sensor;
  i: number;
}

function readings(sensors: Sensor[]): Reading[] {
  const all = sensors.flatMap((sensor) => Array.from(sensor.topic.t, (at, i) => ({ at, sensor, i })));

  return all.sort((a, b) => a.at - b.at || sensors.indexOf(a.sensor) - sensors.indexOf(b.sensor) || a.i - b.i);
}

export interface BuiltMap {
  cloud: MapCloud;
  placed: PlacedSweep[];
}

export function topicMap(index: TopicIndex, options: MapOptions = {}): BuiltMap | null {
  const sensors = sensorsOf(index);

  if (!sensors.length) return null;

  const session = new MapSession(options, true);

  feedFrames(index, session);

  for (const { at, sensor, i } of readings(sensors)) session.sweep({ at, optical: sensor.optical, ...sensor.read(i) });

  return { cloud: session.cloud(), placed: session.placed };
}

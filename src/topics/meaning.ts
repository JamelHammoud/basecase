import { lastAtOrBefore } from '../dataLayers/track';
import { IMU_SCHEMAS, isSchema, ODOMETRY_SCHEMAS } from './schemas';
import type { TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

const R2D = 180 / Math.PI;
const MM = 1000;

export type MeaningField = 'tilt' | 'x' | 'z';

export interface MeaningSeries {
  t: Float64Array;
  v: Float64Array;
}

function imuTilt(topic: RecordedTopic): MeaningSeries | null {
  const [qx, qy] = ['orientation.x', 'orientation.y'].map((p) => topic.numbers.get(p));
  const unknown = topic.lists.get('orientation_covariance');

  if (!qx || !qy) return null;

  const v = Float64Array.from(topic.t, (_, i) => {
    const flagged = unknown && unknown.at[i + 1] > unknown.at[i] && unknown.v[unknown.at[i]] === -1;
    const zz = Math.max(-1, Math.min(1, 1 - 2 * (qx[i] * qx[i] + qy[i] * qy[i])));

    return flagged ? Number.NaN : Math.acos(zz) * R2D;
  });

  return { t: topic.t, v };
}

function odometry(topic: RecordedTopic): Partial<Record<MeaningField, MeaningSeries>> {
  const x = topic.numbers.get('pose.pose.position.x');
  const y = topic.numbers.get('pose.pose.position.y');

  if (!x || !y) return {};

  return {
    x: { t: topic.t, v: Float64Array.from(x, (v) => v * MM) },
    z: { t: topic.t, v: Float64Array.from(y, (v) => -v * MM) },
  };
}

export function topicMeaning(index: TopicIndex): Partial<Record<MeaningField, MeaningSeries>> {
  const imu = index.topics.find((t) => isSchema(IMU_SCHEMAS, t.schema));
  const odom = index.topics.find((t) => isSchema(ODOMETRY_SCHEMAS, t.schema));
  const tilt = imu && imuTilt(imu);

  return { ...(odom ? odometry(odom) : {}), ...(tilt ? { tilt } : {}) };
}

export function heldAt(series: MeaningSeries, times: ArrayLike<number>, offset = 0): number[] {
  return Array.from(times, (time) => {
    const i = lastAtOrBefore(series.t, time);

    return i < 0 ? Number.NaN : series.v[i] + offset;
  });
}

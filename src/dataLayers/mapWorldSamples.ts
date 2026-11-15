import { refuse } from '../cases/validate';
import type { LaserScan, PointCloud2 } from './messages';
import { MAX_POINTS } from './pointSink';
import { cloudSweep, depthSweep, scanSweep, DEPTH_MAX_M, type DepthImage, type Intrinsics } from './mapSweeps';

export function reconstructionScan(scan: LaserScan): Float32Array {
  if (scan.ranges?.length > MAX_POINTS) refuse('Scan reconstruction', 'exceeds its per-sweep sample budget');

  return scanSweep(scan);
}

export function reconstructionCloud(cloud: PointCloud2): Float32Array {
  if (cloud.width * cloud.height > MAX_POINTS) refuse('Scan reconstruction', 'exceeds its per-sweep sample budget');

  if (cloud.data?.byteLength < cloud.row_step * cloud.height)
    refuse('Scan reconstruction', 'needs complete point-cloud rows');

  return cloudSweep(cloud);
}

export function reconstructionDepth(image: DepthImage, lens: Intrinsics): Float32Array {
  if (image.width * image.height > MAX_POINTS) refuse('Scan reconstruction', 'exceeds its per-sweep sample budget');

  if (image.data?.byteLength < image.step * image.height)
    refuse('Scan reconstruction', 'needs complete depth-image rows');

  const float = image.encoding === '32FC1';
  const size = float ? 4 : 2;
  const view = new DataView(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  for (let row = 0; row < image.height; row++)
    for (let column = 0; column < image.width; column++) {
      const at = row * image.step + column * size;
      const depth = float ? view.getFloat32(at, !image.is_bigendian) : view.getUint16(at, !image.is_bigendian) / 1000;

      if (Number.isFinite(depth) && depth > DEPTH_MAX_M)
        refuse('Scan reconstruction', 'needs depth returns within 10 m');
    }

  return depthSweep(image, lens, 1);
}

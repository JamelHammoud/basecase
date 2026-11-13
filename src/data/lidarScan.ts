import type { PortVec } from '../types/ports';

export interface LidarScanFrame {
  origin: PortVec;
  forward?: PortVec;
}

export const LIDAR_SCAN: Record<string, LidarScanFrame> = {
  'slamtec-rplidar-a1m8': { origin: [-19.4, 16.5, 0] },
  'slamtec-rplidar-c1': { origin: [51.9, 10.1, 10.1] },
  'slamtec-rplidar-s2': { origin: [0, 10.4, 1.8] },
  'slamtec-rplidar-a2m12': { origin: [-30.6, 10.6, 0] },
  'slamtec-rplidar-a3m1': { origin: [-30.6, 10.6, 0] },
  'slamtec-rplidar-s3': { origin: [0, 9.2, -30.4] },
  'ldrobot-ld19': { origin: [0, 9.5, -3.8] },
  'ldrobot-ld06': { origin: [0, 9, 0] },
  'ldrobot-stl-27l': { origin: [0, 9.5, -3.8] },
  'livox-mid-360': { origin: [-3.9, 17, 0] },
  'livox-avia': { origin: [0, 0, 35.8] },
  'unitree-4d-lidar-l2': { origin: [0, 12.7, 0] },
  'hokuyo-ust-10lx': { origin: [0, 12.4, 1.4] },
  'ouster-os1': { origin: [0, 9, 3.7] },
  'ouster-os0': { origin: [0, 9, 3.7] },
  'velodyne-vlp-16': { origin: [0, 2, 6.4] },
  'hesai-jt128': { origin: [0, 11.3, 3.8] },
  'ydlidar-x4-pro': { origin: [-10.8, 20, 0] },
};

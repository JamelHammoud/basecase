import { CameraPreset } from '../types/robotics';

export type CameraView = Exclude<CameraPreset, 'perspective'>;

export const CAMERA_VIEWS: Array<{ id: CameraView; label: string }> = [
  { id: 'isometric', label: 'Isometric' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'right', label: 'Side' },
];

import { CameraPreset } from '../types/robotics';

export const CAMERA_VIEWS: Array<{ id: CameraPreset; label: string; shortcut: string }> = [
  { id: 'isometric', label: 'Isometric', shortcut: '1' },
  { id: 'top', label: 'Top', shortcut: '2' },
  { id: 'front', label: 'Front', shortcut: '3' },
  { id: 'right', label: 'Side', shortcut: '4' },
];

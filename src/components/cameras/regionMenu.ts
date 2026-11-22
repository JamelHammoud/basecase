import type { ContextMenuEntry } from '../../design-system';
import type { CameraRegions, Point } from '../../vision/tracking/types';
import type { RegionKind } from './RegionDraw';

export interface RegionEditing {
  current: (camera: string) => CameraRegions | undefined;
  drawLine: (camera: string, from: Point, to: Point) => void;
  drawZone: (camera: string, points: Point[]) => void;
  clear: (camera: string) => void;
}

export function regionEntries(
  camera: string,
  editing: RegionEditing,
  draw: (kind: RegionKind) => void,
): ContextMenuEntry[] {
  const current = editing.current(camera);
  const entries: ContextMenuEntry[] = [
    { label: 'Draw Line', onSelect: () => draw('line') },
    { label: 'Draw Zone', onSelect: () => draw('zone') },
  ];

  if (current?.lines.length || current?.zones.length)
    entries.push({ label: 'Delete Lines and Zones', onSelect: () => editing.clear(camera) });

  return entries;
}

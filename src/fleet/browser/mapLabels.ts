import type { MapLabel } from './mapStage';

export function arrangeMapLabels(labels: MapLabel[], width: number, height: number): MapLabel[] {
  const placed: MapLabel[] = [];
  const occupied = new Set<number>();
  const columns = Math.max(1, Math.floor(width / 150));
  const rows = Math.max(1, Math.floor(height / 36));
  const slots = columns * rows;

  for (const label of labels) {
    const column = Math.max(0, Math.min(columns - 1, Math.floor(label.x / 150)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(label.y / 36)));
    const start = column * rows + row;

    for (let step = 0; step < slots; step++) {
      const slot = (start + step) % slots;

      if (occupied.has(slot)) continue;

      occupied.add(slot);
      placed.push({
        ...label,
        anchorX: label.x,
        anchorY: label.y,
        x: Math.floor(slot / rows) * 150,
        y: (slot % rows) * 36,
      });

      break;
    }
  }

  return placed;
}

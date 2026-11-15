import { shapeKey } from '../print/shapeKey';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';

const box = (id: string, y: number): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 30, height: 20, depth: 30 },
  color: '#d8d8d8',
  note: '',
  visible: true,
  locked: false,
});

const bracket = { ...box('bracket', 30), print: { skip: true, copies: 3 } };
const parts = [box('base', 10), bracket, box('forearm', 50)];

export const repairRecord = {
  name: 'Repair arm',
  parts,
  project: {
    ...DEFAULT_PROJECT,
    prints: [
      {
        id: 'original-print',
        plate: 1,
        material: 'PLA',
        hash: 'original-plate',
        parts: parts.map((part) => ({ id: part.id, key: shapeKey(part) })),
        printer: 'default',
        sentAt: '2026-11-14T00:00:00.000Z',
        state: 'printed',
      },
    ],
  },
};

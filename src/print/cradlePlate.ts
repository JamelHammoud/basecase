import { Matrix4 } from 'three';
import type { PlateFilesInput } from '../three/analysis/plateFiles';
import { plateFiles } from '../three/analysis/plateFiles';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { place } from '../three/analysis/collide';
import type { PreparedCradle } from './cradleJob';

export async function writeCradlePlate({ prepared, plates }: { prepared: PreparedCradle; plates: PlateFilesInput }) {
  const solid = new ShapeSolid(prepared.geometry.positions);
  const id = prepared.part.id;

  try {
    if (plates.files.some((file) => file.items.some((item) => item.id !== id))) throw new Error('cradle:source');

    return await plateFiles(
      {
        ...plates,
        files: plates.files.map((file) => ({ ...file, cradle: prepared.identity })),
        instances: [{ id, key: id, matrix: new Matrix4().toArray() }],
      },
      {
        solidOf: () => solid,
        placeAll: () => [place(id, solid, new Matrix4())],
      },
    );
  } finally {
    solid.dispose();
  }
}

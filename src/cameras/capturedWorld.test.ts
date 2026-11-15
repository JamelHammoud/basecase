import { Raycaster, Scene, Vector3, WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { readWorldFiles } from '../cases/worldImport';
import { kitchenCollider } from '../cases/worldImportFixture';
import { worldComponents } from '../cases/worldComponents';
import { CapturedWorld } from './capturedWorld';

describe('captured world depth geometry', () => {
  it('uses the translated collider table top and restores the visual after a label pass', async () => {
    const world = await readWorldFiles([kitchenCollider()]);

    if (world.kind !== 'mesh') throw new Error('Expected mesh');

    const scene = new Scene();
    const capture = new CapturedWorld(scene, {} as WebGLRenderer);
    const pieces = worldComponents(world.mesh, 64);

    await capture.set({ hash: 'kitchen', asset: { world, pieces }, position: [100, 100, -200] });
    scene.updateMatrixWorld(true);

    const ray = new Raycaster(new Vector3(100, 1800, 1000), new Vector3(0, -1, 0));
    const distance = capture.labels(() => {
      expect(capture.visual.group.visible).toBe(false);

      return ray.intersectObjects(
        scene.children.filter((child) => child.visible),
        true,
      )[0]?.distance;
    });

    expect(distance).toBeDefined();
    expect(Math.abs(distance! - 900)).toBeLessThanOrEqual(10);
    expect(capture.visual.group.visible).toBe(true);
    expect(() =>
      capture.labels(() => {
        throw new Error('capture');
      }),
    ).toThrow('capture');
    expect(capture.visual.group.visible).toBe(true);
    await capture.set(null);
    expect(capture.visual.state().hash).toBeNull();
    capture.dispose();
  });
});

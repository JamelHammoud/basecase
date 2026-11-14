import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RunTrail } from '../../utils/engineeringTypes';
import { CaseTrails } from './caseTrails';
import type { Stage } from './stage';

function stage(): Stage {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10000);
  const rect = { left: 0, top: 0, width: 800, height: 600 };

  camera.position.set(0, 1000, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  return {
    camera,
    overlays: new THREE.Group(),
    renderer: { domElement: { getBoundingClientRect: () => rect } },
  } as unknown as Stage;
}

const trail = (seed: number, passed: boolean, to: [number, number]): RunTrail => ({
  seed,
  passed,
  path: new Float32Array([0, 0, 0, to[0] / 2, 0, to[1] / 2, to[0], 0, to[1]]),
  trip: null,
});

describe('Case trails', () => {
  const trails = [trail(1, true, [300, 0]), trail(2, false, [-300, 0]), trail(3, false, [0, 300])];

  it('draw every run, picking the failed run nearest the pointer and never a passing one', () => {
    const shown = new CaseTrails(stage());

    shown.sync(trails);

    const ends = new Map(shown.ends().map((e) => [e.seed, e]));
    const at = (seed: number) => [ends.get(seed)!.x, ends.get(seed)!.y] as const;

    expect(shown.count).toBe(3);
    expect(shown.pickAt(...at(2))).toBe(2);
    expect(shown.pickAt(...at(3))).toBe(3);
    expect(shown.pickAt(...at(1))).toBeNull();
    expect(shown.pickAt(at(3)[0] + 40, at(3)[1])).toBeNull();
  });

  it('draw and pick nothing once cleared', () => {
    const scene = stage();
    const shown = new CaseTrails(scene);

    shown.sync(trails);
    shown.sync(null);

    expect(shown.count).toBe(0);
    expect(shown.ends()).toEqual([]);
    expect(scene.overlays.children).toHaveLength(0);
  });
});

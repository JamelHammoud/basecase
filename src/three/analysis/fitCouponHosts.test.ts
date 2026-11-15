import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInside, place, type Placed } from './collide';
import { fitCoupons, type FitCouponTask } from './fitCoupons';
import { ShapeSolid } from './shapeSolid';

const solids: ShapeSolid[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  solids.splice(0).forEach((solid) => solid.dispose());
});

function box(size: number, offset = 0) {
  const geometry = new THREE.BoxGeometry(size, size, size).toNonIndexed().translate(offset, 0, 0);
  const positions = new Float32Array(geometry.attributes.position.array);

  geometry.dispose();

  return positions;
}

function solid(positions: Float32Array) {
  const value = new ShapeSolid(positions);

  solids.push(value);

  return value;
}

function exhaustiveHost(fit: Placed, hosts: Placed[]): Placed | undefined {
  return hosts
    .map((host) => {
      const overlap = host.box.clone().intersect(fit.box);
      const volume = overlap.isEmpty()
        ? 0
        : overlap
            .getSize(new THREE.Vector3())
            .toArray()
            .reduce((a, b) => a * b, 1);

      return { host, volume };
    })
    .filter(({ host, volume }) => {
      if (volume <= 0 || Number.isNaN(volume)) return false;

      const transform = host.inverse.clone().multiply(fit.matrix);
      const near = fit.solid.box.clone().expandByScalar(0.5);

      return (
        host.solid.bvh.intersectsBox(near, transform) ||
        isInside(host.solid, fit.solid.box.getCenter(new THREE.Vector3()).applyMatrix4(transform))
      );
    })
    .sort((a, b) => b.volume - a.volume)[0]?.host;
}

function compareCoupons(fit: Placed, hosts: Placed[]) {
  const expected = exhaustiveHost(fit, hosts);
  const placed = [fit, ...hosts];
  const task: FitCouponTask = {
    fits: [{ id: fit.id, key: 'fit' }],
    hosts: hosts.map((host) => host.id),
    downs: Object.fromEntries(hosts.map((host) => [host.id, [1, 0, 0]])),
  };
  const before = placed.map((p) => ({ positions: p.solid.positions.slice(), matrix: p.matrix.toArray() }));
  const actual = fitCoupons(placed, task);
  const selected = fitCoupons(placed, { ...task, hosts: expected ? [expected.id] : [] });

  expect(actual).toEqual(selected);
  expect(actual.map((coupon) => coupon.host)).toEqual(expected ? [expected.id] : []);
  expect(placed.map((p) => ({ positions: p.solid.positions, matrix: p.matrix.toArray() }))).toEqual(before);
}

describe('fit coupon host selection', () => {
  it('matches exhaustive mesh checks through transformed, tied and rejected candidates', () => {
    const fitSolid = solid(box(10));
    const candidates = [solid(box(4)), solid(box(8)), solid(box(20))];
    const corners = [-12, 12].flatMap((offset) => {
      const positions = box(2, offset);

      for (let k = 0; k < positions.length; k += 3) {
        positions[k + 1] += offset;
        positions[k + 2] += offset;
      }

      return [...positions];
    });
    const disconnected = solid(new Float32Array(corners));

    for (let i = 0; i < 16; i++) {
      const frame = new THREE.Matrix4().makeRotationY((i * Math.PI) / 13).setPosition(i * 7, i - 8, i * -3);
      const fit = place('fit', fitSolid, frame);
      const hosts = candidates.map((shape, n) => place(`host-${n}`, shape, frame));
      const rejected = place('disconnected', disconnected, frame);
      const tied = place('tie', candidates[2], frame);
      const shifted = place(
        'shifted',
        candidates[2],
        frame.clone().multiply(new THREE.Matrix4().makeTranslation(30, 0, 0)),
      );
      const ordered = [hosts[0], rejected, hosts[1], hosts[2], tied, shifted];

      compareCoupons(fit, i % 2 ? ordered.reverse() : ordered);
    }
  });

  it('keeps positive overlap, contact tolerance and containment requirements', () => {
    const fit = place('fit', solid(box(10)), new THREE.Matrix4());
    const shape = solid(box(2));
    const offsets = [0, 5.49, 5.51, 6, 7];

    for (const offset of offsets) {
      const host = place('host', shape, new THREE.Matrix4().makeTranslation(offset, 0, 0));

      compareCoupons(fit, [host]);
    }

    for (const gap of [0.49, 0.51]) {
      const shell = solid(new Float32Array([...box(2, -6 - gap), ...box(2, 6 + gap)]));

      compareCoupons(fit, [place('shell', shell, new THREE.Matrix4())]);
    }

    compareCoupons(fit, []);
  });

  it('reads edited placements and retries later instances of an unhosted group', () => {
    const shape = solid(box(10));
    const fit = place('fit', shape, new THREE.Matrix4());
    const host = place('host', solid(box(20)), new THREE.Matrix4());

    compareCoupons(fit, [host]);

    const moved = place('host', host.solid, new THREE.Matrix4().makeTranslation(50, 0, 0));
    const later = place('later', shape, moved.matrix);
    const coupons = fitCoupons([fit, moved, later], {
      fits: [
        { id: 'missing', key: 'fit' },
        { id: fit.id, key: 'fit' },
        { id: later.id, key: 'fit' },
      ],
      hosts: ['missing', moved.id],
      downs: {},
    });

    compareCoupons(fit, [moved]);
    expect(coupons.map((coupon) => [coupon.fit, coupon.host])).toEqual([['later', 'host']]);
  });

  it.each([300, 600])('checks one mesh instead of %i once the largest overlap qualifies', (count) => {
    const shape = solid(box(20));
    const fit = place('fit', solid(box(10)), new THREE.Matrix4());
    const hosts = Array.from({ length: count }, (_, i) => place(`host-${i}`, shape, new THREE.Matrix4()));
    const checked = vi.spyOn(shape.bvh, 'intersectsBox');

    expect(exhaustiveHost(fit, hosts)?.id).toBe('host-0');
    expect(checked).toHaveBeenCalledTimes(count);
    checked.mockClear();

    const coupons = fitCoupons([fit, ...hosts], {
      fits: [{ id: fit.id, key: 'fit' }],
      hosts: hosts.map((host) => host.id),
      downs: {},
    });

    expect(coupons.map((coupon) => coupon.host)).toEqual(['host-0']);
    expect(checked).toHaveBeenCalledTimes(1);
  });
});

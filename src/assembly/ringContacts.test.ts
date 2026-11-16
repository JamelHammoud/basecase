import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { hasThreeContacts, ringAround } from './probe';

it('preserves every eight-point contact verdict and stops at the third contact', () => {
  const ring = ringAround(new Vector3(12, -4, 7), new Vector3(0, 1, 0), 3);
  const saved = ring.map((point) => point.clone());

  for (let mask = 0; mask < 256; mask++) {
    const contacts = ring.filter((_, i) => mask & (1 << i));
    const visited: Vector3[] = [];
    const result = hasThreeContacts(ring, (point) => {
      visited.push(point);

      return contacts.includes(point);
    });
    const end = contacts.length >= 3 ? ring.indexOf(contacts[2]) + 1 : ring.length;

    expect(result).toBe(contacts.length >= 3);
    expect(visited).toEqual(ring.slice(0, end));
    expect(visited.every((point, i) => point === ring[i])).toBe(true);
  }

  expect(ring).toEqual(saved);
});

it('reads edited points afresh and keeps independent contact counts', () => {
  const points = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const touches = (point: Vector3) => point.y > 0;

  expect(hasThreeContacts(points, touches)).toBe(false);
  points[0].y = 1;
  points[1].y = 1;
  points[3].y = 1;
  expect(hasThreeContacts(points, touches)).toBe(true);
  points[1].y = 0;
  expect(hasThreeContacts(points, touches)).toBe(false);
  expect(hasThreeContacts([], touches)).toBe(false);
  expect(hasThreeContacts(points.slice(0, 2), () => true)).toBe(false);
});

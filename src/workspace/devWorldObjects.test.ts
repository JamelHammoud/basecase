import { describe, expect, it } from 'vitest';
import { toMj } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import { worldObjects } from './devWorldObjects';

const box = { id: 'box', position: [100, 20, 0] as [number, number, number], color: '#888888', visible: true };
const cone = { id: 'cone', position: [0, 10, 50] as [number, number, number], color: '#ff8800', visible: true };

const model = { bodies: [{ origin: box.position, parts: [], world: ['box'] }] } as unknown as SimModel;

describe('worldObjects', () => {
  it('places a moved object from the sim poses and keeps the rest where they stand', () => {
    const poses = Float64Array.from([...toMj([300, 20, -40]), 1, 0, 0, 0]);
    const [moved, still] = worldObjects({ model, parts: [box, cone], poses }, null);

    moved.position.forEach((v, i) => expect(v).toBeCloseTo([300, 20, -40][i]));
    expect(still.position).toEqual(cone.position);
  });

  it('reads colour and visibility from the looks, falling back to the part', () => {
    const looks = { box: { visible: false, color: '#00ff00' } };
    const [shown, own] = worldObjects({ model: null, parts: [box, cone], poses: null }, looks);

    expect(shown).toMatchObject({ id: 'box', color: '#00ff00', visible: false, position: box.position });
    expect(own).toMatchObject({ id: 'cone', color: '#ff8800', visible: true });
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { LiveLayer } from './liveLayer';

const block = (id: string, color: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 20, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 40 },
  color,
  note: '',
  visible: true,
  locked: false,
});

const colorOf = (layer: LiveLayer, id: string) => {
  const colors = new Set<string>();

  layer.group(id)?.traverse((o) => {
    if (o instanceof THREE.Mesh) colors.add(`#${(o.material as THREE.MeshStandardMaterial).color.getHexString()}`);
  });

  return [...colors];
};

describe('world looks on the live feed', () => {
  const red = block('red', '#cc2222');
  const blue = block('blue', '#2222cc');

  it('hides and recolours world items by id, and puts back their own colour when the id leaves the map', () => {
    const layer = new LiveLayer(new THREE.Scene());

    layer.sync([red, blue]);
    layer.setLooks({ red: { visible: false, color: '#cc2222' }, blue: { visible: true, color: '#22CC22' } });

    expect(layer.group('red')?.visible).toBe(false);
    expect(colorOf(layer, 'blue')).toEqual(['#22cc22']);
    expect(colorOf(layer, 'red')).toEqual(['#cc2222']);
    expect(layer.items).toHaveLength(2);

    layer.setLooks({ red: { visible: true, color: '#cc2222' } });

    expect(layer.group('red')?.visible).toBe(true);
    expect(colorOf(layer, 'blue')).toEqual(['#2222cc']);

    layer.dispose();
  });

  it('keeps looks on items rebuilt by a scene change, and ignores a colour that isn’t hex', () => {
    const layer = new LiveLayer(new THREE.Scene());
    const moved = { ...red, position: [100, 20, 0] as ScenePart['position'] };

    layer.sync([red]);
    layer.setLooks({ red: { visible: false, color: '#00ff00' } });
    layer.sync([moved]);

    expect(layer.group('red')?.visible).toBe(false);
    expect(colorOf(layer, 'red')).toEqual(['#00ff00']);
    expect(layer.items[0].position.x).toBe(100);

    layer.setLooks({ red: { visible: true, color: 'green' } });

    expect(colorOf(layer, 'red')).toEqual(['#cc2222']);

    layer.dispose();
  });
});

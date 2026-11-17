import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { boardComponents, boardPoseOwners, boardSelection } from './boardComponents';
import { partMatrix } from '../utils/kinematicsMotion';
import { PartLayer } from '../three/viewport/partLayer';

describe('sourced board component geometry', () => {
  it('follows the carrier pose through rendering, rest measurements and picking without changing source parts', () => {
    const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
    const { board, part: host } = defineBoard(scene, 'board');
    const header = boardComponents(host, board)[0];
    const layer = new PartLayer(new Group());
    const rest = new Vector3(...header.position);
    const delta = new Matrix4().makeRotationY(Math.PI / 2).setPosition(50, 20, -10);
    const expected = rest.clone().applyMatrix4(delta);

    layer.syncPose({}, { poseOwners: boardPoseOwners(board), pose: new Map([[host.id, delta]]) });
    layer.sync([host, header], new Set(), 0);
    layer.buildAll();
    layer.applyPose();

    const rendered = layer.get(header.id)!;

    try {
      expect(rendered.position.distanceTo(expected)).toBeLessThan(0.000001);
      expect(new Vector3(...layer.pointAtRest(header.id, expected.toArray())).distanceTo(rest)).toBeLessThan(0.000001);
      expect(layer.toRest(header.id, rendered.position, rendered.quaternion).position.distanceTo(rest)).toBeLessThan(
        0.000001,
      );
      expect(
        layer
          .toRest(header.id, rendered.position, rendered.quaternion)
          .quaternion.angleTo(new Quaternion().setFromRotationMatrix(partMatrix(header))),
      ).toBeLessThan(0.000001);
      expect(
        layer.withRest(
          () => rendered.position.distanceTo(rest),
          () => layer.applyPose(),
        ),
      ).toBeLessThan(0.000001);
      expect(rendered.position.distanceTo(expected)).toBeLessThan(0.000001);
      expect(header.position).toEqual(rest.toArray());

      layer.pose = new Map();
      layer.applyPose();
      expect(rendered.position.distanceTo(rest)).toBeLessThan(0.000001);
    } finally {
      layer.dispose();
    }
  });

  it.each(['top', 'bottom'] as const)('keeps the header pin row in the board frame on the %s side', (side) => {
    const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
    const { board } = defineBoard(scene, 'board');
    const host = box('board', [10, 40, -20], [100, 1.6, 80], 5);

    board.side = side;
    host.rotation = [17, 34, 56];

    for (const rotation of [0, 90, 180, 270] as const) {
      board.placements[0].position = [10, 15];
      board.placements[0].rotation = rotation;

      const header = boardComponents(host, board)[0];
      const pin = new Vector3(-2.5, -1.4, -0.3).applyMatrix4(partMatrix(header));
      const expected = new Vector3(10, (side === 'top' ? 1 : -1) * 0.8, 15).applyMatrix4(partMatrix(host));

      expect(pin.distanceTo(expected)).toBeLessThan(0.00001);
      expect(header.componentId).toBe('jst-b3b-eh-a');
      expect(boardSelection(header.id, board)).toBe('board');
      expect(partMatrix(header).determinant()).toBeCloseTo(new Matrix4().determinant());
    }
  });
});

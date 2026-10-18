import { describe, expect, it } from 'vitest';
import { checkAgainstSkeleton, describeSkeleton, skeletonFromXml } from './robot-skeleton.mjs';

const URDF = `<?xml version="1.0"?>
<!-- tiny arm -->
<robot name="tiny">
  <link name="base"/>
  <link name="arm"/>
  <joint name="shoulder" type="revolute">
    <parent link="base"/>
    <child link="arm"/>
    <origin xyz="0.1 0.02 0.3" rpy="0 0 1.5707963"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.5707963" upper="0.7853982" effort="5" velocity="1"/>
  </joint>
</robot>`;

const MJCF = `<mujoco model="duo">
  <compiler angle="degree"/>
  <worldbody>
    <body name="torso" pos="0 0 0.5">
      <freejoint name="root"/>
      <body name="leg" pos="0 0.1 -0.2" euler="0 0 90">
        <joint name="hip" axis="1 0 0" range="-30 60"/>
        <body name="foot" pos="0 0 -0.2"/>
      </body>
    </body>
  </worldbody>
</mujoco>`;

const round = (v) => v?.map((x) => Math.round(x * 1000) / 1000);
const summary = (sk) =>
  sk.joints.map((j) => ({
    name: j.name,
    type: j.type,
    parent: j.parent,
    child: j.child,
    parentJoint: j.parentJoint,
    pos: round(j.pos),
    axis: round(j.axis),
    limit: round(j.limit),
  }));

describe('robot skeleton', () => {
  it('reads a URDF into the studio frame', () => {
    const sk = skeletonFromXml(URDF);

    expect([sk.kind, sk.name, sk.links, sk.forward]).toEqual(['URDF', 'tiny', 2, '+x']);
    expect(summary(sk)).toMatchInlineSnapshot(`
      [
        {
          "axis": [
            0,
            1,
            0,
          ],
          "child": "arm",
          "limit": [
            -90,
            45,
          ],
          "name": "shoulder",
          "parent": "base",
          "parentJoint": undefined,
          "pos": [
            20,
            -100,
            0,
          ],
          "type": "revolute",
        },
      ]
    `);
    expect(describeSkeleton(sk)).toMatchInlineSnapshot(`
      "URDF "tiny": 2 links, 1 moving joints, zero pose.
      Studio frame: mm, Z up, front −Y, left +X (assuming the source faces +x; if the photo disagrees, call again with another forward).
      z = 0 is the lowest joint/frame; soles and covers usually extend a little below it and the shells above the top joints.
      A joint's coordinate ALONG its own axis marks where its frame sits on the axis line. When the left and right joints agree in magnitude (e.g. ±160), it is real geometry: build to it (stance and hip width). When they disagree (e.g. 109 vs −72), the CAD export put the frames on different faces; take that coordinate from the photo instead.
      Joint extents: X 20…20, Y -100…-100, Z 0…0.

      joint [type] parent → child | position (x, y, z) | axis | offset from parent joint
      shoulder [revolute] base → arm | 20, -100, 0 | +Y | — | range -90…45°"
    `);
  });

  it('reads an MJCF body tree facing +y', () => {
    const sk = skeletonFromXml(MJCF, '+y');

    expect([sk.kind, sk.name, sk.links]).toEqual(['MJCF', 'duo', 3]);
    expect(summary(sk)).toMatchInlineSnapshot(`
      [
        {
          "axis": undefined,
          "child": "torso",
          "limit": undefined,
          "name": "root",
          "parent": "world",
          "parentJoint": undefined,
          "pos": [
            0,
            -0,
            400,
          ],
          "type": "floating",
        },
        {
          "axis": [
            -0,
            -1,
            0,
          ],
          "child": "leg",
          "limit": [
            -30,
            60,
          ],
          "name": "hip",
          "parent": "torso",
          "parentJoint": "root",
          "pos": [
            0,
            -100,
            200,
          ],
          "type": "hinge",
        },
        {
          "axis": undefined,
          "child": "foot",
          "limit": undefined,
          "name": "(foot)",
          "parent": "leg",
          "parentJoint": "hip",
          "pos": [
            0,
            -100,
            0,
          ],
          "type": "fixed",
        },
      ]
    `);
  });

  it('checks joints against part bounds', () => {
    const sk = skeletonFromXml(URDF);
    const parts = [
      { id: 'base', bounds: { min: [-40, -40, 0], max: [40, 40, 20] } },
      { id: 'arm', bounds: { min: [-30, -120, 10], max: [30, -80, 80] } },
    ];

    expect(checkAgainstSkeleton(sk, parts)).toMatchInlineSnapshot(`
      "1 joints and frames checked; the lowest joint fits best 10 mm above the model's floor (pass floorOffset to fix it). Joints whose left/right frames disagree along their axis are checked as axis lines.
      Every joint sits inside the model.
      Joint span X 20…20, Y -100…-100, Z 10…10; model span X -40…40, Y -120…40, Z 0…80.
      Model top is 70 mm above the highest joint; check that against the photo (shells above the top joint, e.g. a head or cap)."
    `);
    expect(checkAgainstSkeleton(sk, parts, 5)).toMatchInlineSnapshot(`
      "1 joints and frames checked; the lowest joint fits best 5 mm above the model's floor (pass floorOffset to fix it). Joints whose left/right frames disagree along their axis are checked as axis lines.
      Joints outside the model. Each one means that link is in the wrong place or too small: move or resize it until no joint is listed (residuals of 5–10 mm still put a whole leg or arm in the wrong place):
      - shoulder at (20, -100, 5) is 5 mm outside the model (nearest: arm)
      Joint span X 20…20, Y -100…-100, Z 5…5; model span X -40…40, Y -120…40, Z 0…80.
      Model top is 75 mm above the highest joint; check that against the photo (shells above the top joint, e.g. a head or cap)."
    `);
  });

  it('rejects other XML', () => {
    expect(() => skeletonFromXml('<svg></svg>')).toThrow('Not a URDF (<robot>) or MJCF (<mujoco>) file.');
  });
});

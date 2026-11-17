import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseMjcf } from './mjcf';
import { childrenOf, mjAngles, placement, type MjAngles } from './mjcfFrames';
import { parseXml } from './robotImport.fixtures';

function previousChildren(
  el: Element,
  tag: string,
  angles: MjAngles,
  at = new THREE.Matrix4(),
): Array<{ el: Element; frame: THREE.Matrix4 }> {
  return [...el.children].flatMap((c): Array<{ el: Element; frame: THREE.Matrix4 }> => {
    if (c.tagName === tag) return [{ el: c, frame: at }];

    if (c.tagName !== 'frame') return [];

    const frame = placement((k) => c.getAttribute(k) ?? undefined, angles);

    return previousChildren(c, tag, angles, at.clone().multiply(frame));
  });
}

function framedChildren(depth: number): string {
  if (!depth) return '<geom name="end"/><body name="end"><geom name="hidden"/></body>';

  return `<geom name="before_${depth}"/><site><geom name="ignored"/></site>
    <frame pos="${depth} -2 3" euler="10 20 ${depth}">${framedChildren(depth - 1)}</frame>
    <frame pos="0 1 0"><body name="sibling_${depth}"/><geom name="sibling_${depth}"/></frame>
    <body name="after_${depth}"/>`;
}

describe('MJCF frame traversal', () => {
  it('preserves ordered elements and exact transforms across nested frames and source edits', () => {
    for (const depth of [0, 1, 8, 32]) {
      const doc = parseXml(`<mujoco><compiler angle="degree" eulerseq="XYZ"/>${framedChildren(depth)}</mujoco>`);
      const root = doc.documentElement;
      const angles = mjAngles(root);
      const at = new THREE.Matrix4().makeRotationX(0.7).setPosition(3, 5, 7);
      const saved = at.toArray();

      for (const tag of ['geom', 'body', 'frame', 'missing']) {
        const before = childrenOf(root, tag, angles, at);
        const expected = previousChildren(root, tag, angles, at);

        expect(before).toEqual(expected);
        expect(before.every((entry, i) => entry.el === expected[i].el)).toBe(true);
        expect(at.toArray()).toEqual(saved);

        const again = childrenOf(root, tag, angles, at);

        expect(again).not.toBe(before);
        again.pop();
        expect(before).toEqual(previousChildren(root, tag, angles, at));
      }

      const frame = [...root.children].find((child) => child.tagName === 'frame');

      if (!frame) continue;

      const attribute = frame.getAttribute.bind(frame);

      frame.getAttribute = (name) => (name === 'pos' ? '9 8 7' : attribute(name));

      const edited = { ...angles, toRad: (v: number) => v };

      expect(childrenOf(root, 'geom', edited, at)).toEqual(previousChildren(root, 'geom', edited, at));
    }
  });

  it('imports nested body and visual placements without leaking across body boundaries', () => {
    const doc = parseXml(`<mujoco model="frames"><worldbody>
      <frame pos="1 2 3"><body name="base" pos="0 0 4">
        <geom type="sphere" size="0.1"/>
        <frame pos="2 0 0"><geom type="box" size="1 2 3"/>
          <frame pos="0 3 0"><body name="arm" pos="0 0 5">
            <joint name="hinge"/><geom type="sphere" size="0.2"/>
          </body></frame>
        </frame>
        <body name="side" pos="-1 0 0"><geom type="sphere" size="0.3"/></body>
      </body></frame>
      <frame/><site><body name="ignored"/></site>
    </worldbody></mujoco>`);
    const model = parseMjcf(doc);
    const position = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m).toArray();

    expect([...model.links.keys()]).toEqual(['world', 'base', 'arm', 'side']);
    expect([...model.links.values()].map((link) => position(link.world))).toEqual([
      [0, 0, 0],
      [1, 2, 7],
      [3, 5, 12],
      [0, 2, 7],
    ]);
    expect(model.links.get('base')!.visuals.map((visual) => position(visual.origin))).toEqual([
      [0, 0, 0],
      [2, 0, 0],
    ]);
    expect(model.links.get('arm')!.visuals).toHaveLength(1);
    expect(model.joints.map((joint) => [joint.name, joint.parent, joint.child, position(joint.world)])).toEqual([
      ['hinge', 'base', 'arm', [3, 5, 12]],
      ['side_fixed', 'base', 'side', [0, 2, 7]],
    ]);
  });
});

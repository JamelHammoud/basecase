import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importRobot, rawUrl } from './robotImport';

class XmlElement {
  children: XmlElement[] = [];
  tagName: string;
  private attrs: Map<string, string>;

  constructor(tagName: string, attrs: Map<string, string>) {
    this.tagName = tagName;
    this.attrs = attrs;
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  get attributes() {
    return [...this.attrs].map(([name, value]) => ({ name, value }));
  }
}

class TinyDomParser {
  parseFromString(text: string) {
    const root = new XmlElement('#document', new Map());
    const stack = [root];

    for (const [, close, tag, attrText, selfClose] of text.matchAll(
      /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g,
    )) {
      if (close) {
        stack.pop();

        continue;
      }

      const el = new XmlElement(
        tag,
        new Map([...attrText.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]])),
      );

      stack[stack.length - 1].children.push(el);

      if (!selfClose) stack.push(el);
    }

    return { documentElement: root.children[0], querySelector: () => null };
  }
}

const file = (path: string, text: string) => {
  const f = new File([text], path.split('/').pop()!);

  Object.defineProperty(f, 'webkitRelativePath', { value: path });

  return f;
};

const URDF = `<?xml version="1.0"?>
<robot name="two_link_arm">
  <material name="grey"><color rgba="0.5 0.5 0.5 1"/></material>
  <link name="base_link">
    <inertial><origin xyz="0 0 0.01"/><mass value="1.5"/></inertial>
    <visual><origin xyz="0 0 0.05"/><geometry><box size="0.2 0.1 0.1"/></geometry><material name="grey"/></visual>
  </link>
  <link name="upper_link">
    <visual><origin xyz="0 0 0.1"/><geometry><cylinder radius="0.02" length="0.2"/></geometry></visual>
  </link>
  <link name="slider_link">
    <visual><geometry><sphere radius="0.015"/></geometry></visual>
  </link>
  <joint name="shoulder" type="revolute">
    <parent link="base_link"/><child link="upper_link"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-1.5708" upper="1.5708" effort="12" velocity="3.14159"/>
  </joint>
  <joint name="lift" type="prismatic">
    <parent link="upper_link"/><child link="slider_link"/>
    <origin xyz="0 0 0.2"/><axis xyz="0 0 1"/>
    <limit lower="0" upper="0.04"/>
  </joint>
</robot>`;

const MJCF = `<mujoco model="mini_arm">
  <compiler angle="radian"/>
  <default>
    <default class="visual"><geom contype="0" conaffinity="0"/></default>
    <default class="collision"><geom group="3"/></default>
  </default>
  <worldbody>
    <body name="base" pos="0 0 0.1">
      <inertial pos="0 0 0" mass="2"/>
      <geom class="visual" type="box" size="0.05 0.05 0.05" rgba="1 0 0 1"/>
      <geom class="collision" type="box" size="0.2 0.2 0.2"/>
      <body name="arm" pos="0 0 0.1">
        <joint name="hinge" axis="0 1 0" range="-1 1" actuatorfrcrange="-4 6"/>
        <geom class="visual" type="capsule" fromto="0 0 0 0 0 0.2" size="0.02"/>
      </body>
    </body>
  </worldbody>
</mujoco>`;

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importRobot', () => {
  it('reads a URDF into parts and joints in millimetres and degrees', async () => {
    const robot = await importRobot({ kind: 'files', files: [file('arm/urdf/arm.urdf', URDF)] });
    const [shoulder, lift] = robot.joints;

    expect(robot.name).toBe('Two link arm');
    expect(robot.parts.map((p) => p.name)).toEqual(['Base', 'Upper', 'Slider']);
    expect(robot.parts[0]).toMatchObject({ color: '#808080', massG: 1500 });
    expect(robot.notes).toEqual([]);
    expect(shoulder).toMatchObject({ id: 'shoulder', type: 'revolute', range: [-90, 90], effortNm: 12, velocity: 180 });
    expect(shoulder.parent).toEqual([robot.parts[0].id]);
    expect(shoulder.child).toEqual([robot.parts[1].id]);
    expect(lift).toMatchObject({ id: 'lift', type: 'prismatic', range: [0, 40], parentJoint: 'shoulder' });
    expect(lift.origin[1]).toBeCloseTo(shoulder.origin[1] + 200);
  });

  it('reads an MJCF, keeping visual geoms and actuator limits', async () => {
    const robot = await importRobot({ kind: 'files', files: [file('mini/mini.xml', MJCF)] });

    expect(robot.name).toBe('Mini arm');
    expect(robot.parts.map((p) => p.name)).toEqual(['Base', 'Arm']);
    expect(robot.parts[0]).toMatchObject({ color: '#ff0000', massG: 2000 });
    expect(robot.parts[0].dimensions).toEqual({ width: 100, height: 100, depth: 100 });
    expect(robot.joints).toHaveLength(1);
    expect(robot.joints[0]).toMatchObject({ id: 'hinge', effortNm: 6, range: [-57.3, 57.3] });
  });

  it('asks for a robot description when the folder has none', async () => {
    await expect(importRobot({ kind: 'files', files: [file('x/readme.txt', 'hi')] })).rejects.toThrow(
      'Choose a folder with a .urdf or MJCF .xml file.',
    );
  });
});

describe('rawUrl', () => {
  it('turns GitHub blob links into raw links', () => {
    expect(rawUrl(' https://github.com/me/repo/blob/main/robots/a.urdf ')).toBe(
      'https://raw.githubusercontent.com/me/repo/main/robots/a.urdf',
    );
    expect(rawUrl('https://example.com/a.xml')).toBe('https://example.com/a.xml');
  });
});

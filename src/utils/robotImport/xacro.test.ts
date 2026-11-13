import { afterEach, describe, expect, it, vi } from 'vitest';
import { localFile } from './robotImport.fixtures';
import { urlResolver } from './sources';
import { localTree, treeResolver } from './tree';
import { expandXacro } from './xacro';
import { fusionArmFiles, urArmFiles } from './xacro.fixtures';
import { attr, elementsOf, parseXml, type XmlElement } from './xml';

const NS = 'xmlns:xacro="http://www.ros.org/wiki/xacro"';
const REFUSED = /^Couldn’t read /;

async function expandIn(files: Record<string, string | Uint8Array>, entry: string, spy?: (ref: string) => void) {
  const tree = await localTree(Object.entries(files).map(([p, t]) => localFile(p, t)));
  const resolver = await treeResolver(tree, entry);
  const read: typeof resolver.read = (ref, from) => {
    spy?.(ref);

    return resolver.read(ref, from);
  };

  return parseXml(await expandXacro(resolver.entry.text, { read, from: entry }));
}

const expand = (body: string, more: Record<string, string> = {}) =>
  expandIn({ 'pkg/robot.xacro': `<robot name="r" ${NS}>${body}</robot>`, ...more }, 'pkg/robot.xacro');

const all = (el: XmlElement, tag: string): XmlElement[] =>
  elementsOf(el.children).flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);
const named = (el: XmlElement, tag: string, name: string) => all(el, tag).find((c) => attr(c, 'name') === name)!;
const jointOf = (robot: XmlElement, name: string) =>
  elementsOf(robot.children).find((c) => c.tag === 'joint' && attr(c, 'name') === name)!;
const limitOf = (robot: XmlElement, joint: string) =>
  elementsOf(jointOf(robot, joint).children).find((c) => c.tag === 'limit')!;

describe('expandXacro', () => {
  it('expands a fusion2urdf package with its materials, transmissions and gazebo files', async () => {
    const robot = await expandIn(fusionArmFiles(), 'desk_arm_description/urdf/desk_arm.xacro');

    expect(attr(robot, 'name')).toBe('desk_arm');
    expect(all(robot, 'link').map((l) => attr(l, 'name'))).toContain('base_plate');
    expect(attr(named(robot, 'material', 'silver'), 'name')).toBe('silver');
    expect(all(robot, 'transmission')).toHaveLength(2);
    expect(all(robot, 'gazebo')[1].children).toContainEqual({
      tag: 'material',
      attrs: [],
      children: ['Gazebo/Silver'],
    });
    expect(limitOf(robot, 'Shoulder').attrs).toEqual([
      ['lower', '-1.5'],
      ['upper', '1.5'],
      ['effort', '2.9'],
      ['velocity', '4.7'],
    ]);
  });

  it('expands UR-style macros with blocks, defaults, args and xacro:if', async () => {
    const robot = await expandIn(urArmFiles(), 'ur_description/urdf/ur.urdf.xacro');

    expect(attr(robot, 'name')).toBe('ur5e');
    expect(all(robot, 'joint').map((j) => attr(j, 'name'))).toEqual([
      'left_base_joint',
      'left_shoulder_pan_joint',
      'left_shoulder_lift_joint',
      'left_tool0_joint',
    ]);
    expect(attr(limitOf(robot, 'left_shoulder_pan_joint'), 'lower')).toBe(String(-2 * Math.PI));
    expect(attr(limitOf(robot, 'left_shoulder_lift_joint'), 'upper')).toBe(String(Math.PI));
    expect(attr(limitOf(robot, 'left_shoulder_lift_joint'), 'velocity')).toBe(String(Math.PI));

    const lift = jointOf(robot, 'left_shoulder_lift_joint');

    expect(elementsOf(lift.children).find((c) => c.tag === 'origin')?.attrs).toEqual([
      ['xyz', '0 0 0.2125'],
      ['rpy', `0 ${Math.PI / 2} 0`],
    ]);
    expect(all(robot, 'link').map((l) => attr(l, 'name'))).not.toContain('left_fake_sensor');
  });

  it('reads properties, named blocks, calls and escapes', async () => {
    const robot = await expand(`
      <xacro:property name="len" value="0.3"/>
      <xacro:property name="len" default="9"/>
      <xacro:property name="geom"><box size="1 1 1"/></xacro:property>
      <xacro:macro name="part" params="name **parts"><link name="\${name}"><xacro:insert_block name="parts"/></link></xacro:macro>
      <xacro:part name="a"><parts><visual><geometry><xacro:insert_block name="geom"/></geometry></visual></parts></xacro:part>
      <xacro:call macro="part" name="b"><parts><collision/></parts></xacro:call>
      <xacro:element xacro:name="link" name="a$$\${len * 2}"/>`);

    expect(all(robot, 'link').map((l) => attr(l, 'name'))).toEqual(['a', 'b', 'a$0.6']);
    expect(all(robot, 'box')).toHaveLength(1);
    expect(all(robot, 'collision')).toHaveLength(1);
  });
});

describe('expandXacro fails closed', () => {
  it('never reads an include outside the import', async () => {
    const asked: string[] = [];
    const tries = [
      'https://evil.example/arm.xacro',
      'file:///etc/passwd',
      'C:/Windows/win.ini',
      '/etc/passwd',
      '../../../etc/passwd',
    ];

    for (const ref of tries) {
      await expect(
        expandIn(
          { 'pkg/robot.xacro': `<robot ${NS}><xacro:include filename="${ref}"/></robot>` },
          'pkg/robot.xacro',
          (r) => asked.push(r),
        ),
      ).rejects.toThrow(/^Couldn’t read /);
    }

    expect(asked).toEqual(['/etc/passwd', '../../../etc/passwd']);
  });

  it('never fetches an include that climbs out of a linked repo', async () => {
    const fetched: string[] = [];
    const entry = `<robot ${NS}><xacro:include filename="../../../../other/repo/main/arm.xacro"/></robot>`;

    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);

      return new Response(url.endsWith('/me/arm/main/urdf/arm.xacro') ? entry : 'missing', {
        status: url.endsWith('/me/arm/main/urdf/arm.xacro') ? 200 : 404,
      });
    });

    const resolver = await urlResolver('https://github.com/me/arm/blob/main/urdf/arm.xacro');

    await expect(
      expandXacro(resolver.entry.text, { read: resolver.read, from: '/me/arm/main/urdf/arm.xacro' }),
    ).rejects.toThrow(/^Couldn’t read /);
    expect(fetched.every((u) => u.startsWith('https://raw.githubusercontent.com/me/arm/main/'))).toBe(true);
  });

  it('stops a macro that calls itself, and one that doubles forever', async () => {
    await expect(expand('<xacro:macro name="m"><link name="x"/><xacro:m/></xacro:macro><xacro:m/>')).rejects.toThrow(
      REFUSED,
    );

    const doubling = Array.from(
      { length: 30 },
      (_, i) => `<xacro:macro name="m${i + 1}"><xacro:m${i}/><xacro:m${i}/></xacro:macro>`,
    ).join('');

    await expect(
      expand(`<xacro:macro name="m0"><link name="x"/></xacro:macro>${doubling}<xacro:m30/>`),
    ).rejects.toThrow(REFUSED);
  });

  it('stops a file that includes itself and a property that refers to itself', async () => {
    await expect(expand('<xacro:include filename="robot.xacro"/>')).rejects.toThrow(REFUSED);
    await expect(
      expand('<xacro:property name="a" value="${b}"/><xacro:property name="b" value="${a}"/><link name="${a}"/>'),
    ).rejects.toThrow(REFUSED);
  });

  it('stops text that grows without end', async () => {
    const props = Array.from({ length: 40 }, (_, i) => `<xacro:property name="p${i + 1}" value="\${p${i}}\${p${i}}"/>`);

    await expect(
      expand(`<xacro:property name="p0" value="ab"/>${props.join('')}<link name="\${p40}"/>`),
    ).rejects.toThrow(REFUSED);
  });

  it('stops a document that repeats one large property many times', async () => {
    const props = Array.from({ length: 18 }, (_, i) => `<xacro:property name="p${i + 1}" value="\${p${i}}\${p${i}}"/>`);
    const doubling = Array.from(
      { length: 9 },
      (_, i) => `<xacro:macro name="m${i + 1}"><xacro:m${i}/><xacro:m${i}/></xacro:macro>`,
    ).join('');
    const big = `<xacro:property name="p0" value="ab"/>${props.join('')}`;
    const links = `<xacro:macro name="m0"><link name="\${p18}"/></xacro:macro>${doubling}<xacro:m9/>`;

    await expect(expand(big + links)).rejects.toThrow(REFUSED);
  });

  it('stops many large values that are computed and never output', async () => {
    const props = Array.from({ length: 18 }, (_, i) => `<xacro:property name="p${i + 1}" value="\${p${i}}\${p${i}}"/>`);
    const big = `<xacro:property name="p0" value="ab"/>${props.join('')}`;
    const kept = Array.from(
      { length: 2000 },
      (_, k) => `<xacro:property name="q${k}" value="\${p18}${k}"/><xacro:if value="\${q${k} == 'x'}"/>`,
    ).join('');
    const passing = Array.from({ length: 2000 }, () => `<xacro:if value="\${p18 + 'x' == 'x'}"/>`).join('');

    await expect(expand(big + kept)).rejects.toThrow(REFUSED);
    await expect(expand(big + passing)).rejects.toThrow(REFUSED);
  });

  it('refuses expressions that call functions, and what it can’t evaluate', async () => {
    await expect(expand(`<link name="\${__import__('os').system('ls')}"/>`)).rejects.toThrow(REFUSED);
    await expect(expand(`<link name="\${constructor.constructor('return process')()}"/>`)).rejects.toThrow(REFUSED);
    await expect(expand('<link name="$(env HOME)"/>')).rejects.toThrow(REFUSED);
    await expect(expand(`<link name="\${xacro.load_yaml('limits.yaml')}"/>`)).rejects.toThrow(REFUSED);
    await expect(expand('<xacro:unknown_macro/>')).rejects.toThrow(REFUSED);
    await expect(expand('<link name="$(arg missing)"/>')).rejects.toThrow(REFUSED);
  });

  it('names the include that failed', async () => {
    await expect(
      expand('<xacro:include filename="parts.xacro"/>', {
        'pkg/parts.xacro': `<robot ${NS}><link name="\${oops}"/></robot>`,
      }),
    ).rejects.toThrow('Couldn’t read pkg/parts.xacro');
    await expect(expand('<xacro:include filename="gone.xacro"/>')).rejects.toThrow('Couldn’t read gone.xacro');
  });

  it('refuses document type declarations', async () => {
    const text = '<!DOCTYPE r [<!ENTITY a "aaaa">]><robot name="&a;"/>';

    await expect(expandXacro(text, { read: async () => null, from: 'r.xacro' })).rejects.toThrow(
      'Couldn’t read r.xacro',
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { expect, it } from 'vitest';
import { expandXacro } from './xacro';
import { attr, elementsOf, parseXml } from './xml';

const expand = (body: string) => expandXacro(`<robot>${body}</robot>`, { read: async () => null, from: 'robot.xacro' });

function blockFixture(count: number) {
  const indices = Array.from({ length: count }, (_, i) => i);
  const params = indices.map((i) => `${i % 2 ? '**' : '*'}b${i}`).join(' label:=local ');
  const body = indices
    .toReversed()
    .map((i) => `<xacro:insert_block name="b${i}"/>`)
    .join('');
  const blocks = indices
    .map((i) => {
      const link = `<link name="\${label}_${i}"/>`;

      return i % 2 ? `<wrapper>${link}</wrapper>` : link;
    })
    .join(' ignored text ');

  return `<xacro:property name="label" value="caller"/>
    <xacro:macro name="many" params="${params}">${body}</xacro:macro>
    <xacro:many>${blocks}<unused/></xacro:many>
    <xacro:many>${blocks}</xacro:many>`;
}

it.each([300, 600])('binds %i mixed blocks in source order with independent calls and caller scope', async (count) => {
  const source = blockFixture(count);
  const output = await expand(source);
  const names = elementsOf(parseXml(output).children).map((el) => attr(el, 'name'));
  const expected = Array.from({ length: count }, (_, i) => `caller_${count - i - 1}`);

  expect(names).toEqual([...expected, ...expected]);
  expect(await expand(source)).toBe(output);
});

it('refuses a missing block and starts the next expansion with fresh bindings', async () => {
  const macro = `<xacro:macro name="pair" params="*a **b">
    <xacro:insert_block name="a"/><xacro:insert_block name="b"/>
    <xacro:insert_block name="a"/>
    </xacro:macro>`;

  await expect(expand(`${macro}<xacro:pair><link name="a"/></xacro:pair>`)).rejects.toThrow(
    'Couldn’t read robot.xacro',
  );

  const output = await expand(`${macro}<xacro:pair><link name="a"/><wrapper><link name="b"/></wrapper></xacro:pair>`);

  expect(elementsOf(parseXml(output).children).map((el) => attr(el, 'name'))).toEqual(['a', 'b', 'a']);
});

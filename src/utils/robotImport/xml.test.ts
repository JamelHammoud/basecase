import { describe, expect, it } from 'vitest';
import { parseXml, serializeXml, XmlError } from './xml';

describe('xacro XML cursor', () => {
  it('reads mixed markup, namespaced tags and quoted attributes at nonzero offsets', () => {
    const source = `<?xml version="1.0"?>
      <!-- robot --><robot xmlns:xacro="urn:xacro" name='arm &amp; hand'>
        <xacro:macro name="link" params='name'><link name="\${name}">
          <visual note="a > b &quot;quoted&quot;"/><text>left &lt; right &#65; &#x1F916;</text>
          <![CDATA[<mesh filename="raw"/>]]>
        </link></xacro:macro>
      </robot><!-- end -->`;
    const root = parseXml(source);
    const serialized = serializeXml(root);

    expect(root.tag).toBe('robot');
    expect(root.attrs).toEqual([
      ['xmlns:xacro', 'urn:xacro'],
      ['name', 'arm & hand'],
    ]);
    expect(serialized).toContain('<xacro:macro name="link" params="name">');
    expect(serialized).toContain('<text>left &lt; right A 🤖</text>');
    expect(serialized).toContain('&lt;mesh filename="raw"/&gt;');
    expect(serializeXml(parseXml(serialized))).toBe(serialized);
    expect(parseXml('<empty/>')).toEqual({ tag: 'empty', attrs: [], children: [] });
  });

  it('rejects malformed tags without searching ahead and recovers on the next document', () => {
    const failures = [
      ['<robot>< link/><link/></robot>', 'Malformed tag at 7'],
      ['<robot><link x=unquoted/><link/></robot>', 'Malformed tag at 7'],
      ['<robot></ bad></robot>', 'Mismatched </>'],
      ['<robot><link></robot></link>', 'Mismatched </robot>'],
      ['<robot></robot extra></robot>', 'Mismatched </>'],
      ['<robot><link/></robot', 'Mismatched </>'],
      ['<robot><link/>', 'Expected one root element'],
      ['<robot/><robot/>', 'Expected one root element'],
      ['<!DOCTYPE robot><robot/>', 'Document type declarations aren’t read'],
      ['<robot><!-- missing', 'Unclosed -->'],
    ];

    for (const [source, message] of failures) {
      expect(() => parseXml(source)).toThrow(new XmlError(message));
      expect(parseXml('<robot><link name="ok"></link></robot>').children).toEqual([
        { tag: 'link', attrs: [['name', 'ok']], children: [] },
      ]);
    }
  });

  it('keeps every sibling and attribute in source order across a large document', () => {
    const children = Array.from({ length: 2000 }, (_, i) => ({
      tag: 'link',
      attrs: [
        ['name', `link_${i}`],
        ['index', String(i)],
        ['empty', ''],
        ['name', `duplicate_${i}`],
        ['xacro:value', `left < right & "quoted" 'text' 🤖 ${i}`],
        ['unknown', '&unrecognized;'],
      ] as Array<[string, string]>,
      children: [{ tag: 'visual', attrs: [], children: [] }],
    }));
    const root = { tag: 'robot', attrs: [], children };

    const source = serializeXml(root).replaceAll('empty=""', "empty=''\t");

    expect(parseXml(source)).toEqual(root);
    expect(parseXml('<robot a="&#65;" b=\'&#x1F916;\'/>').attrs).toEqual([
      ['a', 'A'],
      ['b', '🤖'],
    ]);
    expect(parseXml(source)).toEqual(root);
  });
});

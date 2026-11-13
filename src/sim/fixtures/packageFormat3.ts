interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

const DEPENDENCY = [
  'build_depend',
  'build_export_depend',
  'buildtool_depend',
  'buildtool_export_depend',
  'exec_depend',
  'depend',
  'doc_depend',
  'test_depend',
  'conflict',
  'replace',
];
const SEQUENCE = new RegExp(
  '^name version description (?:maintainer )+(?:license )+(?:url )*(?:author )*' +
    `(?:(?:${DEPENDENCY.join('|')}) )*(?:group_depend )*(?:member_of_group )*(?:export )?$`,
);
const NAME = /^[a-z](_?[a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2}$/;
const EMAIL = /^[-a-zA-Z0-9_%+]+(\.[-a-zA-Z0-9_%+]+)*@[-a-zA-Z0-9%]+(\.[-a-zA-Z0-9%]+)*\.[a-zA-Z]{2,}$/;
const TOKEN = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;

function parseXml(xml: string): XmlNode {
  const body = xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '');
  const root: XmlNode = { tag: '#document', attrs: {}, text: '', children: [] };
  const stack = [root];

  for (const [, close, tag, attrText, selfClose, text] of body.matchAll(TOKEN)) {
    const top = stack[stack.length - 1];

    if (text !== undefined) {
      top.text += text;

      continue;
    }

    if (close) {
      stack.pop();

      continue;
    }

    const attrs = Object.fromEntries([...attrText.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const node: XmlNode = { tag, attrs, text: '', children: [] };

    top.children.push(node);

    if (!selfClose) stack.push(node);
  }

  return root.children[0];
}

const textOf = (pkg: XmlNode, tag: string) => pkg.children.find((c) => c.tag === tag)?.text.trim() ?? '';

export function packageFormat3Errors(xml: string): string[] {
  const pkg = parseXml(xml);

  if (pkg?.tag !== 'package') return ['the root element is not <package>'];

  const errors: string[] = [];
  const order = pkg.children.map((c) => `${c.tag} `).join('');

  if (pkg.attrs.format !== '3') errors.push('format is not 3');

  if (!SEQUENCE.test(order)) errors.push(`elements are out of the format 3 sequence: ${order}`);

  if (!NAME.test(textOf(pkg, 'name'))) errors.push(`bad name ${textOf(pkg, 'name')}`);

  if (!VERSION.test(textOf(pkg, 'version'))) errors.push(`bad version ${textOf(pkg, 'version')}`);

  for (const m of pkg.children.filter((c) => c.tag === 'maintainer')) {
    if (!EMAIL.test(m.attrs.email ?? '')) errors.push(`maintainer ${m.text} has no valid email`);
  }

  for (const tag of ['description', 'license', ...DEPENDENCY]) {
    if (pkg.children.some((c) => c.tag === tag && !c.text.trim())) errors.push(`empty <${tag}>`);
  }

  return errors;
}

export function packageXmlValues(xml: string, tag: string): string[] {
  return parseXml(xml)
    .children.filter((c) => c.tag === tag)
    .map((c) => c.text.trim());
}

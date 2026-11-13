export class XmlElement {
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

export class TinyDomParser {
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

export const parseXml = (text: string) => new TinyDomParser().parseFromString(text) as unknown as Document;

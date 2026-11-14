import { DECODE_LIMITS, refused } from './limits';

export type RosDialect = 'cdr' | 'ros1';

export type RosArrayKind = 'single' | 'sequence' | 'fixed';

export interface RosField {
  name: string;
  type: string;
  primitive: boolean;
  kind: RosArrayKind;
  bound: number;
}

export interface RosType {
  fields: RosField[];
  minBytes: number;
}

export interface RosSchema {
  dialect: RosDialect;
  root: string;
  types: Map<string, RosType>;
}

export const PRIMITIVE_BYTES: Record<string, number> = {
  bool: 1,
  byte: 1,
  char: 1,
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  int64: 8,
  uint64: 8,
  float32: 4,
  float64: 8,
  string: 4,
  wstring: 4,
  time: 8,
  duration: 8,
};

const STAMP_FIELDS = ['int32 sec', 'uint32 nanosec'];
const BUILTIN_SECTIONS = new Map([
  ['builtin_interfaces/Time', STAMP_FIELDS],
  ['builtin_interfaces/Duration', STAMP_FIELDS],
]);

const SEPARATOR = /^=+$/;
const SECTION = /^MSG:\s*(\S+)$/;
const CONSTANT = /^\S+\s+\w+\s*=/;
const TYPE_TOKEN = /^([A-Za-z][\w/]*)(?:<=\d+)?(?:\[(<=)?(\d*)\])?$/;
const FIELD_NAME = /^[A-Za-z]\w*$/;

interface Section {
  name: string;
  lines: string[];
}

interface ParseContext {
  fields: number;
}

export const isPrimitive = (type: string) => Object.hasOwn(PRIMITIVE_BYTES, type);

export const normalizeTypeName = (name: string) => name.trim().replace('/msg/', '/');

const packageOf = (name: string) => (name.includes('/') ? name.slice(0, name.indexOf('/')) : '');

function resolveType(raw: string, section: string): string {
  if (isPrimitive(raw)) return raw;

  if (raw === 'Header') return 'std_msgs/Header';

  if (raw.includes('/')) return normalizeTypeName(raw);

  const pkg = packageOf(section);

  return pkg ? `${pkg}/${raw}` : raw;
}

function arrayShape(bounded: boolean, length: string | undefined): { kind: RosArrayKind; bound: number } {
  if (length === undefined) return { kind: 'single', bound: 1 };

  if (length === '') return { kind: 'sequence', bound: Infinity };

  const bound = Number(length);

  if (bound > DECODE_LIMITS.items) throw refused();

  return { kind: bounded ? 'sequence' : 'fixed', bound };
}

function parseField(line: string, section: string): RosField | null {
  const text = line.split('#')[0].trim();

  if (text === '' || CONSTANT.test(text)) return null;

  const [typeToken, name] = text.split(/\s+/);
  const match = TYPE_TOKEN.exec(typeToken);

  if (!match || !name || !FIELD_NAME.test(name)) throw refused();

  const type = resolveType(match[1], section);
  const shape = arrayShape(match[2] !== undefined, match[3]);

  return { name, type, primitive: isPrimitive(type), ...shape };
}

function splitSections(text: string, root: string): Section[] {
  const sections: Section[] = [{ name: root, lines: [] }];
  let expectName = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (SEPARATOR.test(line)) {
      expectName = true;

      continue;
    }

    const header = expectName ? SECTION.exec(line) : null;

    if (header) {
      sections.push({ name: normalizeTypeName(header[1]), lines: [] });
      expectName = false;

      continue;
    }

    sections[sections.length - 1].lines.push(line);
  }

  return sections;
}

function addSection(types: Map<string, RosField[]>, section: Section, context: ParseContext) {
  const fields = section.lines.map((line) => parseField(line, section.name)).filter((f) => f !== null);

  context.fields += fields.length;

  if (context.fields > DECODE_LIMITS.fields || types.size >= DECODE_LIMITS.types) throw refused();

  types.set(section.name, fields);
}

function fieldMinBytes(field: RosField, element: number) {
  if (field.kind === 'single') return element;

  return field.kind === 'fixed' ? element * field.bound : 4;
}

class Measure {
  readonly #fields: Map<string, RosField[]>;
  readonly #dialect: RosDialect;
  readonly #done = new Map<string, RosType & { height: number }>();
  readonly #visiting = new Set<string>();

  constructor(fields: Map<string, RosField[]>, dialect: RosDialect) {
    this.#fields = fields;
    this.#dialect = dialect;
  }

  visit(name: string, depth: number): RosType & { height: number } {
    const known = this.#done.get(name);

    if (known && depth + known.height <= DECODE_LIMITS.depth) return known;

    const fields = this.#fields.get(name);

    if (!fields || known || depth >= DECODE_LIMITS.depth || this.#visiting.has(name)) throw refused();

    this.#visiting.add(name);

    const measured = this.#measure(fields, depth);

    this.#visiting.delete(name);
    this.#done.set(name, measured);

    return measured;
  }

  #measure(fields: RosField[], depth: number) {
    let minBytes = 0;
    let height = 1;

    for (const field of fields) {
      const child = field.primitive ? null : this.visit(field.type, depth + 1);
      const element = child ? child.minBytes : PRIMITIVE_BYTES[field.type];

      height = Math.max(height, child ? child.height + 1 : 1);
      minBytes += fieldMinBytes(field, element);
    }

    const empty = fields.length === 0 && this.#dialect === 'cdr';

    return { fields, minBytes: empty ? 1 : minBytes, height };
  }

  types(): Map<string, RosType> {
    return new Map([...this.#done].map(([name, { fields, minBytes }]) => [name, { fields, minBytes }]));
  }
}

export function parseRosDefinition(text: string, rootName: string, dialect: RosDialect): RosSchema {
  const root = normalizeTypeName(rootName);
  const fields = new Map<string, RosField[]>();
  const context: ParseContext = { fields: 0 };

  for (const section of splitSections(text, root)) addSection(fields, section, context);

  for (const [name, lines] of BUILTIN_SECTIONS) {
    if (!fields.has(name)) addSection(fields, { name, lines }, context);
  }

  const measure = new Measure(fields, dialect);

  for (const name of fields.keys()) measure.visit(name, 0);

  return { dialect, root, types: measure.types() };
}

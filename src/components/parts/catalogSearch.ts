import { CATEGORY_LABELS, PART_CATALOG, hardwareVariant } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup, ComponentInfo } from '../../data/components';
import { BEARINGS, HARDWARE_BY_TYPE, HardwareFamily, familyOf, isMetric, makeSpec } from '../../data/hardware';
import type { CatalogItem } from '../../types/robotics';

const FAMILY_WORDS: Record<string, string> = {
  screws: 'screw bolt cap fastener',
  nuts: 'nut nylock',
  washers: 'washer',
  inserts: 'insert threaded heat set',
  standoffs: 'standoff spacer pcb',
  pins: 'pin dowel axle shaft',
  bearings: 'bearing ball',
};

const GROUP_WORDS: Partial<Record<ComponentGroup, string>> = {
  Servos: 'servo motor actuator joint',
  Motors: 'motor stepper gearmotor dc',
  Hands: 'hand finger dexterous end effector',
  Grippers: 'gripper claw end effector',
  LiDAR: 'lidar laser scanner range',
  'Depth Cameras': 'depth camera stereo 3d vision',
  Computers: 'computer board sbc linux',
  Microcontrollers: 'microcontroller mcu board arduino',
  Drivers: 'driver board controller',
  Sensors: 'sensor',
  Cameras: 'camera vision',
};

interface Indexed {
  item: CatalogItem;
  name: string;
  text: string;
  group: string;
}

const inParts = (item: CatalogItem) => !!item.componentId || !!item.hardware;

const componentWords = (c: ComponentInfo) => `${c.group} ${GROUP_WORDS[c.group] ?? ''}`;

const familyWords = (fam: HardwareFamily) => `${fam.name} ${FAMILY_WORDS[fam.id]}`;

const groupText = (item: CatalogItem, c: ComponentInfo | undefined, fam: HardwareFamily | undefined): string => {
  if (c) return componentWords(c);

  return fam ? familyWords(fam) : CATEGORY_LABELS[item.category].label;
};

const indexItem = (item: CatalogItem): Indexed => {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const h = item.hardware;
  const fam = h ? familyOf(h.type) : undefined;
  const text = [
    item.name,
    item.description,
    item.keywords,
    CATEGORY_LABELS[item.category].label,
    c ? componentWords(c) : '',
    fam ? `${familyWords(fam)} ${fam.types.find((t) => t.type === h!.type)?.label ?? ''}` : '',
  ]
    .join(' ')
    .toLowerCase();

  return { item, name: item.name.toLowerCase(), text, group: groupText(item, c, fam).toLowerCase() };
};

const INDEX: Indexed[] = PART_CATALOG.filter(inParts).map(indexItem);

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wordMatcher = (w: string) => {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(w)}`);

  return (text: string) => (w.length >= 3 ? text.includes(w) : re.test(text));
};

interface SizeQuery {
  size?: string;
  length?: number;
  words: string[];
}

const takeSize = (rest: string): { size?: string; length?: number; rest: string } => {
  const m = rest.match(/\bm(\d+(?:\.\d)?)(?:\s*x\s*(\d+(?:\.\d+)?)\s*(?:mm)?)?\b/);

  if (m && isMetric(`M${m[1]}`)) {
    return { size: `M${m[1]}`, length: m[2] ? Number(m[2]) : undefined, rest: rest.replace(m[0], ' ') };
  }

  const bearing = Object.keys(BEARINGS).find((b) => new RegExp(`\\b${b.toLowerCase()}\\b`).test(rest));

  if (!bearing) return { rest };

  return { size: bearing, rest: rest.replace(new RegExp(`\\b${bearing.toLowerCase()}\\b`), ' ') };
};

export function parseSizeQuery(q: string): SizeQuery {
  const { size, length, rest } = takeSize(q.toLowerCase().replace(/[×*]/g, 'x'));
  const words = rest.split(/\s+/).filter(Boolean);

  if (!size || length !== undefined) return { size, length, words };

  const n = words.find((w) => /^\d+(?:\.\d+)?(?:mm)?$/.test(w));

  if (!n) return { size, length, words };

  return { size, length: parseFloat(n), words: words.filter((w) => w !== n) };
}

const fitsSize = (e: Indexed, size: string, length: number | undefined): boolean => {
  const h = e.item.hardware;

  if (!h || !HARDWARE_BY_TYPE[h.type].sizes.includes(size)) return false;

  return length === undefined || !!HARDWARE_BY_TYPE[h.type].lengths;
};

export function searchCatalog(query: string): CatalogItem[] {
  const { size, length, words } = parseSizeQuery(query.trim());
  const matchers = words.map(wordMatcher);
  const matches = (e: Indexed) => matchers.every((m) => m(e.text));

  if (size) {
    return INDEX.filter((e) => fitsSize(e, size, length) && matches(e)).map((e) =>
      hardwareVariant(e.item, makeSpec(e.item.hardware!.type, { size, length })),
    );
  }

  if (words.length === 0) return [];

  const q = words.join(' ');

  return INDEX.filter(matches)
    .map((e, i) => ({
      e,
      score:
        (e.name.startsWith(q) ? 10 : 0) +
        matchers.reduce((n, m) => n + (m(e.name) ? 3 : 1) + (m(e.group) ? 4 : 0), 0) -
        i / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e.item);
}

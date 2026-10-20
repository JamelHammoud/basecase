import {
  HEX_NUT,
  LOCK_NUT,
  STANDOFF,
  hardwareName,
  screwHead,
  setScrewRecess,
  type HardwareSpec,
  type MetricSize,
  type ScrewRecess,
} from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import { describeKey, hardwareKey } from '../utils/bom';
import type { GuideItem, GuideItemKind, GuideStep, GuideTool, ToolIcon } from './guideTypes';

const FASTENER_TYPES = new Set<HardwareSpec['type']>([
  'socket_head',
  'button_head',
  'countersunk',
  'pan_head',
  'hex_bolt',
  'set_screw',
  'hex_nut',
  'lock_nut',
  'square_nut',
  'washer',
  'large_washer',
  'standoff_mf',
  'standoff_ff',
  'dowel_pin',
]);

export const isInsert = (p: ScenePart) => p.kind === 'hardware' && p.hardware?.type === 'heat_insert';

export const isFastener = (p: ScenePart) =>
  p.kind === 'hardware' && !!p.hardware && FASTENER_TYPES.has(p.hardware.type);

export const isMajor = (p: ScenePart) => !isFastener(p) && !isInsert(p);

export function hashText(text: string): string {
  let h = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  return (h >>> 0).toString(36);
}

const round = (v: number) => Math.round(v * 10) / 10;

function shapeSignature(p: ScenePart): string {
  const d = p.dimensions;
  const dims = [d.width, d.height, d.depth, d.thickness ?? 0].map(round).join('x');
  const verts = p.cad?.positions ?? p.mesh?.positions ?? p.sculptMesh?.positions;
  const sample = verts ? verts.slice(0, 600).map(round).join(',') + `#${verts.length}` : '';

  return hashText(`${p.kind}|${dims}|${p.color}|${JSON.stringify(p.deformers ?? {})}|${sample}`);
}

export function itemKeyOf(p: ScenePart): string {
  if (p.componentId) return `component:${p.componentId}${p.componentVariant ? `|${p.componentVariant}` : ''}`;

  if (p.supplyId) return `supply:${p.supplyId}`;

  if (p.kind === 'hardware' && p.hardware) return hardwareKey(p.hardware);

  return `printed:${shapeSignature(p)}`;
}

const kindOfKey = (key: string): GuideItemKind => {
  if (key.startsWith('hardware:')) return 'hardware';

  return key.startsWith('printed:') ? 'printed' : 'bought';
};

const baseName = (name: string) => name.replace(/\s+\d+$/, '').trim();

function describeItem(key: string, sample: ScenePart): Pick<GuideItem, 'name' | 'detail' | 'hardware'> {
  if (sample.kind === 'hardware' && sample.hardware) {
    return { name: hardwareName(sample.hardware), detail: '', hardware: sample.hardware };
  }

  const known = describeKey(key);

  if (known) return { name: known.name, detail: known.detail };

  return { name: baseName(sample.name), detail: '' };
}

function letterLabel(index: number): string {
  let n = index;
  let out = '';

  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return out;
}

export function firstUseOrder(steps: GuideStep[], parts: ScenePart[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const visit = (id: string) => {
    const part = byId.get(id);

    if (!part) return;

    const key = itemKeyOf(part);

    if (!seen.has(key)) order.push(key);

    seen.add(key);
  };

  for (const step of steps) step.partIds.forEach(visit);

  parts.forEach((p) => visit(p.id));

  return order;
}

export function buildItems(parts: ScenePart[], order: string[]): GuideItem[] {
  const groups = new Map<string, ScenePart[]>();

  for (const p of parts) {
    const key = itemKeyOf(p);

    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  let letters = 0;
  let numbers = 0;

  return order.flatMap((key) => {
    const members = groups.get(key);

    if (!members) return [];

    const kind = kindOfKey(key);
    const label = kind === 'hardware' ? String(101 + numbers++) : letterLabel(letters++);

    return [
      {
        key,
        label,
        kind,
        qty: members.length,
        partIds: members.map((p) => p.id),
        sample: members[0].id,
        ...describeItem(key, members[0]),
      },
    ];
  });
}

const recessOf = (spec: HardwareSpec): ScrewRecess | null =>
  screwHead(spec)?.recess ?? setScrewRecess(spec)?.recess ?? null;

type ToolInfo = { id: string; name: string; icon: ToolIcon };

function recessTool(r: ScrewRecess): ToolInfo {
  switch (r.kind) {
    case 'hex':
      return { id: `hex:${r.s}`, name: `${r.s} mm hex key`, icon: 'hex-key' };
    case 'torx':
      return { id: `torx:${r.size}`, name: `${r.size} Torx driver`, icon: 'torx' };
    case 'slot':
      return { id: `slot:${r.width}`, name: `${r.width} mm flat screwdriver`, icon: 'flat-screwdriver' };
    default:
      return { id: `cross:${r.size}`, name: `${r.size} screwdriver`, icon: 'screwdriver' };
  }
}

function wrenchFor(spec: HardwareSpec) {
  const size = spec.size as MetricSize;
  const nut = spec.type === 'lock_nut' ? LOCK_NUT[size] : HEX_NUT[size];
  const s = spec.type.startsWith('standoff') ? STANDOFF[size]?.s : nut?.s;

  return s ? { id: `wrench:${s}`, name: `${s} mm wrench`, icon: 'wrench' as const } : null;
}

const WRENCH_TYPES = new Set<HardwareSpec['type']>(['hex_nut', 'lock_nut', 'hex_bolt', 'standoff_mf', 'standoff_ff']);

function toolFor(spec: HardwareSpec): ToolInfo | null {
  if (spec.type === 'heat_insert') return { id: 'soldering-iron', name: 'Soldering iron', icon: 'soldering-iron' };

  if (WRENCH_TYPES.has(spec.type)) return wrenchFor(spec);

  const recess = recessOf(spec);

  return recess ? recessTool(recess) : null;
}

export function buildTools(items: GuideItem[], material: string): GuideTool[] {
  const tools = new Map<string, GuideTool>();
  const add = (tool: ToolInfo, itemKey: string) => {
    const known = tools.get(tool.id) ?? { ...tool, itemKeys: [] };

    known.itemKeys.push(itemKey);
    tools.set(tool.id, known);
  };

  for (const item of items) {
    const tool = item.hardware ? toolFor(item.hardware) : null;

    if (tool) add(tool, item.key);

    if (item.kind === 'printed') add({ id: 'printer', name: `3D printer, ${material}`, icon: 'printer' }, item.key);
  }

  const rank = (t: GuideTool) => (t.icon === 'printer' ? 0 : 1);

  return [...tools.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'en', { numeric: true }));
}

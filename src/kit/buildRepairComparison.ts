import { appearanceParts } from '../appearance/model';
import { canonicalJson } from '../skills/hash';
import { labelsOn } from '../print/labels/partLetters';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { NetEnd, Netlist } from '../wiring/netlist';
import { isPrinted, printMaterialOf } from '../utils/bom';
import type { FrozenKit } from './frozenKit';

export type BuildPartChange =
  | 'added'
  | 'removed'
  | 'ambiguous'
  | 'identity'
  | 'geometry'
  | 'placement'
  | 'manufacturing'
  | 'relationships'
  | 'presentation';

export interface BuildRevisionComparison {
  parts: Array<{ id: string; changes: BuildPartChange[] }>;
  replacements: string[];
  unresolved: string[];
  wiring: boolean;
  joints: boolean;
  topology: boolean;
}

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

function indexParts(kit: FrozenKit) {
  const parts = new Map<string, ScenePart[]>();

  for (const part of kit.parts.filter((part) => part.role === 'solid')) {
    const entries = parts.get(part.id) ?? [];

    entries.push(part);
    parts.set(part.id, entries);
  }

  return parts;
}

const identity = (part: ScenePart) => ({
  kind: part.kind,
  component: part.componentId,
  variant: part.componentVariant,
  hardware: part.hardware,
  supply: part.supplyId,
  source: part.robotLink,
});

const relationships = (part: ScenePart) => ({
  group: part.group?.id,
  frame: part.frame,
  mates: part.mates,
  joint: part.jointId,
  mirror: part.mirrorOf,
});

const presentation = (part: ScenePart) => ({
  name: part.name,
  color: part.color,
  opacity: part.opacity,
  note: part.note,
  visible: part.visible,
  locked: part.locked,
  category: part.category,
  finishes: appearanceParts([part]).map((entry) => entry.appearance),
});

function manufacturing(kit: FrozenKit, part: ScenePart) {
  return {
    sheet: part.sheet,
    sheetTransform: part.sheetTransform,
    printed: isPrinted(part)
      ? {
          material: printMaterialOf(part, kit.project),
          infill: kit.project.infillPct,
          process: kit.project.printProcess,
          down: part.print?.down,
          label:
            labelsOn(kit.project) && !part.print?.noLabel
              ? kit.manifest.guide.items.find((item) => item.partIds.includes(part.id))?.label
              : null,
        }
      : null,
    board: kit.project.electronicsBoard?.partId === part.id ? kit.project.electronicsBoard : null,
  };
}

function sameGeometry(source: FrozenKit, target: FrozenKit, id: string) {
  const a = source.geometry[id];
  const b = target.geometry[id];

  if (!a || !b) return false;

  return (
    a.positions.length === b.positions.length &&
    a.indices.length === b.indices.length &&
    a.positions.every((value, index) => value === b.positions[index]) &&
    a.indices.every((value, index) => value === b.indices[index])
  );
}

function partChanges(source: FrozenKit, target: FrozenKit, a: ScenePart, b: ScenePart): BuildPartChange[] {
  const changes: BuildPartChange[] = [];

  if (!same(identity(a), identity(b))) changes.push('identity');

  if (!sameGeometry(source, target, a.id) || !same(a.dimensions, b.dimensions)) changes.push('geometry');

  if (!same([a.position, a.rotation], [b.position, b.rotation])) changes.push('placement');

  if (!same(manufacturing(source, a), manufacturing(target, b))) changes.push('manufacturing');

  if (!same(relationships(a), relationships(b))) changes.push('relationships');

  if (!same(presentation(a), presentation(b))) changes.push('presentation');

  return changes;
}

const endpoint = (end: NetEnd | null) => end && { id: end.id, connector: end.connector, port: end.port };

function wiring(netlist: Netlist | undefined) {
  if (!netlist) return null;

  const nets = (entries: Netlist['power']['nets']) =>
    entries.map((net) => ({ from: endpoint(net.from), to: endpoint(net.to), route: net.route }));

  return {
    buses: netlist.buses.map((bus) => ({ ...bus, nets: nets(bus.nets) })),
    power: { ...netlist.power, source: endpoint(netlist.power.source), nets: nets(netlist.power.nets) },
    unmatched: netlist.unmatched,
  };
}

function jointDeclarations(joints: RobotJoint[] = []) {
  return joints.map(({ name: _name, ...joint }) => joint).sort((a, b) => a.id.localeCompare(b.id));
}

export function compareBuildRevisions(source: FrozenKit, target: FrozenKit): BuildRevisionComparison {
  const before = indexParts(source);
  const after = indexParts(target);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const parts = ids.map((id): BuildRevisionComparison['parts'][number] => {
    const a = before.get(id) ?? [];
    const b = after.get(id) ?? [];

    if (a.length > 1 || b.length > 1) return { id, changes: ['ambiguous'] };

    if (!a.length) return { id, changes: ['added'] };

    if (!b.length) return { id, changes: ['removed'] };

    return { id, changes: partChanges(source, target, a[0], b[0]) };
  });
  const unresolved = parts
    .filter((part) => part.changes.some((change) => ['ambiguous', 'added', 'removed'].includes(change)))
    .map((part) => part.id);
  const replacements = parts
    .filter((part) => part.changes.some((change) => ['identity', 'geometry', 'manufacturing'].includes(change)))
    .map((part) => part.id);

  return {
    parts,
    replacements,
    unresolved,
    wiring: !same(
      [wiring(source.manifest.wiring), source.project.wiring],
      [wiring(target.manifest.wiring), target.project.wiring],
    ),
    joints: !same(jointDeclarations(source.project.joints), jointDeclarations(target.project.joints)),
    topology: unresolved.length > 0 || parts.some((part) => part.changes.some((change) => change === 'relationships')),
  };
}

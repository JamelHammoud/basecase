import { expect, it } from 'vitest';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { isPrinted } from '../utils/bom';
import { freezeBuildKit, readFrozenKit } from './frozenKit';
import { kitFixture } from './kit.fixtures';
import { compareBuildRevisions } from './buildRepairComparison';

const designs = [
  'differential rover',
  'SO-101-style arm',
  'quadruped',
  'hexapod',
  'biped',
  'pan-tilt camera',
  'gripper',
  'conveyor mechanism',
  'mixed-servo arm',
  'repeated limb modules',
];

async function retained(name: string) {
  const job = kitFixture(name);
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const content = await freezeBuildKit({ job, meshes });

  return { content, kit: readFrozenKit(content) };
}

it.each(designs)('compares exact retained %s identities without changing frozen bytes', async (name) => {
  const { content, kit: source } = await retained(name);
  const target = structuredClone(source);
  const original = JSON.stringify(source);
  const bytes = JSON.stringify(content);
  const printed = source.parts.find(isPrinted)!;
  const part = target.parts.find((item) => item.id === printed.id)!;

  part.name = 'Presentation only';
  part.color = '#222222';
  part.visible = false;
  part.note = 'Changed note';

  const presentation = compareBuildRevisions(source, target);

  expect(presentation.replacements).toEqual([]);
  expect(presentation.parts.find((item) => item.id === printed.id)?.changes).toEqual(['presentation']);
  expect(presentation.unresolved).toEqual([]);
  target.geometry[printed.id].positions[0] += 0.000001;
  expect(compareBuildRevisions(source, target).replacements).toEqual([printed.id]);
  expect(compareBuildRevisions(source, target).parts.find((item) => item.id === printed.id)?.changes).toEqual([
    'geometry',
    'presentation',
  ]);
  expect(JSON.stringify(source)).toBe(original);
  expect(JSON.stringify(content)).toBe(bytes);
});

it('distinguishes catalog variants, manufacturing material, wiring and joint declarations', async () => {
  const { kit: source } = await retained('mixed-servo arm');
  const target = structuredClone(source);
  const printed = target.parts.find(isPrinted)!;
  const component = target.parts.find((part) => part.componentId === 'feetech-sts3215')!;

  printed.printMaterial = 'PETG';
  component.componentVariant = 'c019';
  target.project.wiring = [{ from: { partId: component.id, port: 'in' }, to: { partId: printed.id, port: 'out' } }];
  target.project.joints![0].range = [-10, 10];

  const result = compareBuildRevisions(source, target);

  expect(result.replacements.sort()).toEqual([printed.id, component.id].sort());
  expect(result.parts.find((part) => part.id === printed.id)?.changes).toContain('manufacturing');
  expect(result.parts.find((part) => part.id === component.id)?.changes).toContain('identity');
  expect(result.wiring).toBe(true);
  expect(result.joints).toBe(true);
});

it('ignores wiring endpoint and joint names while retaining their physical declarations', async () => {
  const { kit: source } = await retained('mixed-servo arm');
  const target = structuredClone(source);

  target.project.joints!.forEach((joint) => (joint.name = 'Renamed joint'));
  target.manifest.wiring!.buses.forEach((bus) =>
    bus.nets.forEach((net) => {
      net.from.name = 'Renamed source';
      net.to.name = 'Renamed destination';
    }),
  );
  expect(compareBuildRevisions(source, target).wiring).toBe(false);
  expect(compareBuildRevisions(source, target).joints).toBe(false);
  target.manifest.wiring!.buses[0].servos[0].busId = 250;
  expect(compareBuildRevisions(source, target).wiring).toBe(true);
});

it('leaves additions and removals unmatched even when their display names agree', async () => {
  const { kit: source } = await retained('differential rover');
  const target = structuredClone(source);
  const old = target.parts.find(isPrinted)!;
  const id = old.id;

  old.id = 'new-identity';
  target.geometry[old.id] = target.geometry[id];
  delete target.geometry[id];

  const result = compareBuildRevisions(source, target);

  expect(result.parts.find((part) => part.id === id)?.changes).toEqual(['removed']);
  expect(result.parts.find((part) => part.id === old.id)?.changes).toEqual(['added']);
  expect(result.unresolved.sort()).toEqual([id, old.id].sort());
  expect(result.replacements).toEqual([]);
});

it('refuses to infer an identity when either Kit repeats the same id', async () => {
  const { kit: source } = await retained('repeated limb modules');
  const target = structuredClone(source);
  const part = target.parts[0];

  target.parts.push({ ...part, name: 'Another module' });

  const result = compareBuildRevisions(source, target);

  expect(result.unresolved).toContain(part.id);
  expect(result.replacements).not.toContain(part.id);
  expect(result.parts.find((item) => item.id === part.id)?.changes).toEqual(['ambiguous']);
});

it('treats placement, relationships and manufacturing settings as physical changes', async () => {
  const { kit: source } = await retained('differential rover');
  const target = structuredClone(source);
  const part = target.parts.find(isPrinted)!;

  part.position[0] += 0.5;
  part.mates = [{ port: 'mount', target: 'other', targetPort: 'mount', type: 'fastened' }];
  target.project.infillPct += 5;

  const result = compareBuildRevisions(source, target);

  expect(result.parts.find((item) => item.id === part.id)?.changes).toEqual([
    'placement',
    'manufacturing',
    'relationships',
  ]);
  expect(result.replacements).toContain(part.id);
  expect(result.topology).toBe(true);
});

it('compares mesh indices exactly and ignores quantities of spare manufactured copies', async () => {
  const { kit: source } = await retained('repeated limb modules');
  const target = structuredClone(source);
  const printed = target.parts.find(isPrinted)!;

  printed.print = { ...printed.print, copies: 20, plate: 4, at: [12, 16] };
  expect(compareBuildRevisions(source, target).replacements).toEqual([]);

  const indices = target.geometry[printed.id].indices;

  [indices[0], indices[1]] = [indices[1], indices[0]];
  expect(compareBuildRevisions(source, target).replacements).toEqual([printed.id]);
});

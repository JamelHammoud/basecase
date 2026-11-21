import { expect, it } from 'vitest';
import { finishAppearance } from '../appearance/model';
import { compareBuildRevisions } from './buildRepairComparison';
import { repairDesigns, repairKitFixture } from './buildRepair.fixtures';
import { frozenKitContent, readFrozenKit } from './frozenKit';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { buildDemand } from './buildDemand';

it.each(repairDesigns)(
  'retains appearance-only %s revision changes without replacing manufactured parts',
  async (name) => {
    const source = await repairKitFixture(name);
    const target = structuredClone(source.kit);
    const plate = target.parts.find((part) => part.id === 'service-plate')!;
    const original = JSON.stringify(source.content);

    plate.appearance = finishAppearance('metal', '#abcdef');

    const content = frozenKitContent(target);
    const retained = readFrozenKit(content);
    const comparison = compareBuildRevisions(source.kit, retained);

    expect(comparison.parts.find((part) => part.id === plate.id)?.changes).toEqual(['presentation']);
    expect(comparison.replacements).toEqual([]);
    expect(buildDemand(retained)).toEqual(buildDemand(source.kit));

    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const build = await store.create('Robot', source.content);
    const started = await store.startRepair({
      id: build.id,
      target: content,
      request: crypto.randomUUID(),
      signal: new AbortController().signal,
    });
    const repair = started.repairs![0];

    expect(repair.count).toBe(0);
    expect(repair.affected).toEqual([]);
    await store.stageRepair(build.id, repair.id);
    await store.finishRepair({ id: build.id, repair: repair.id, purchases: {} });

    const reopened = await createBuildStore(storage).open(build.id);

    expect(reopened.record.kit).toBe(source.content.hash);
    expect(reopened.record.configuration).toBe(content.hash);
    expect(reopened.kit.parts.find((part) => part.id === plate.id)?.appearance).toEqual(plate.appearance);
    expect(JSON.stringify(source.content)).toBe(original);
  },
);

it('reports a finish inside a custom node without treating it as a replacement', async () => {
  const source = (await repairKitFixture()).kit;
  const root = source.parts.find((part) => part.id === 'service-plate')!;

  root.customNodes = [
    {
      id: 'node-a',
      name: 'Node',
      nodeType: 'primitive',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: root.dimensions,
      color: root.color,
      part: { ...root },
    },
  ];

  const target = structuredClone(source);
  const child = target.parts.find((part) => part.id === root.id)!.customNodes![0].part!;

  child.appearance = finishAppearance('paint', '#aabbcc');

  const comparison = compareBuildRevisions(source, target);

  expect(comparison.parts.find((part) => part.id === root.id)?.changes).toEqual(['presentation']);
  expect(comparison.replacements).toEqual([]);
});

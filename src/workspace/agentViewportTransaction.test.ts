import { expect, it } from 'vitest';
import { Group } from 'three';
import { specToPart } from '../agent/agentScene';
import { PartLayer } from '../three/viewport/partLayer';
import { editWithOperands } from '../booleans/operands';
import { applyAgentOps } from './applyAgentOps';

it('retains unchanged viewport groups through a transaction, selection and undo', async () => {
  const before = Array.from({ length: 60 }, (_, i) =>
    specToPart({ id: `part-${i}`, shape: 'box', position: [i * 30, 0, 0] }),
  );
  let parts = before;
  const layer = new PartLayer(new Group());

  layer.sync(parts, new Set(), 0);
  layer.buildAll();

  const retained = before.slice(1).map((part) => layer.get(part.id));

  await applyAgentOps([{ op: 'update', part: { id: 'part-0', size: [40, 20, 10] } }], {
    current: () => parts,
    commitParts: (edit) => {
      parts = editWithOperands(parts, edit);
    },
    viewport: () => null,
    setCursor: () => {},
    setAction: () => {},
    isFollowing: () => false,
    guard: () => null,
    touch: () => {},
  });
  layer.sync(parts, new Set(['part-0']), 0);
  layer.buildAll();

  for (const [i, part] of before.slice(1).entries()) expect(layer.get(part.id)).toBe(retained[i]);

  layer.sync(before, new Set(), 0);
  layer.buildAll();

  for (const [i, part] of before.slice(1).entries()) expect(layer.get(part.id)).toBe(retained[i]);

  layer.dispose();
});

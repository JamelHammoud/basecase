import { expect, it } from 'vitest';
import { frozenClient } from './frozenClient';
import { repairKitFixture } from './buildRepair.fixtures';
import { frozenPartOutput, frozenOutputSelection } from './frozenPartOutput';

it('exports the exact retained target manufacturing bytes after a source revision changes', async () => {
  const source = await repairKitFixture();
  const target = await repairKitFixture(undefined, 'geometry');
  const client = frozenClient();
  const output = (await client.call('partOutput', frozenOutputSelection(target.kit, ['service-plate'])))!;

  client.dispose();

  expect(output.bytes).toEqual(Uint8Array.from(target.kit.outputs[`plates/${output.name}`]));
  expect(output.bytes).not.toEqual(frozenPartOutput(frozenOutputSelection(source.kit, ['service-plate']))!.bytes);
  expect(frozenPartOutput(frozenOutputSelection(target.kit, ['service-servo']))).toBeNull();
});

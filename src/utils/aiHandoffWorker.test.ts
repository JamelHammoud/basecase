import { expect, it } from 'vitest';
import { buildAIHandoffPayload } from './aiHandoff';
import { handoffPart } from './aiHandoffInput';
import { specToPart } from '../agent/agentScene';

it('retains complete handoff output without sending mesh or texture payloads and reuses immutable inputs', () => {
  const source = specToPart({
    id: 'bracket',
    shape: 'cad_part',
    cad: {
      language: 'openscad',
      code: 'cube(10);',
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
      indices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
    },
  });
  const photo = { ...source, id: 'photo', kind: 'image_plane' as const, imageDataUrl: 'large texture' };
  const parts = [source, photo];
  const input = parts.map(handoffPart);
  const normalize = (value: ReturnType<typeof buildAIHandoffPayload>) => ({
    ...value,
    spec: { ...value.spec, timestamp: '' },
  });

  expect(normalize(buildAIHandoffPayload('Arm', 'Carry a camera', input))).toEqual(
    normalize(buildAIHandoffPayload('Arm', 'Carry a camera', parts)),
  );
  expect(input[0].cad!.positions).toEqual([]);
  expect(input[1].imageDataUrl).toBeUndefined();
  expect(handoffPart(source)).toBe(input[0]);
  expect(handoffPart({ ...source, name: 'New bracket' }).name).toBe('New bracket');
});

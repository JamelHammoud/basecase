import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { awaitPartModels } from './agentPartModels';
import { REPAIR_HANDLERS } from './agentRepairRequests';

describe('repair_part request', () => {
  it('opens the same repair flow as the UI and preserves its reply', async () => {
    const reply = { text: 'Opened repair guide for Left Shoulder Servo.', plan: { steps: ['large scene plan'] } };
    const repairPart = vi.fn(async () => reply);

    expect(await REPAIR_HANDLERS.repair_part({ id: 'left-shoulder-servo' }, { repairPart })).toEqual({
      text: reply.text,
    });
    expect(repairPart).toHaveBeenCalledExactlyOnceWith('left-shoulder-servo');
  });

  it('preserves an unavailable reason from the repair flow', async () => {
    const reply = { text: 'Couldn’t find a removal path for Left Shoulder Servo.' };
    const repairPart = vi.fn(async () => reply);

    expect(await REPAIR_HANDLERS.repair_part({ id: 'left-shoulder-servo' }, { repairPart })).toEqual(reply);
  });

  it('refuses malformed target ids before opening a guide', async () => {
    const repairPart = vi.fn();

    for (const id of [undefined, null, 1, {}, [], '', ' ', 'x'.repeat(201)])
      expect(await REPAIR_HANDLERS.repair_part({ id }, { repairPart })).toEqual({
        text: 'Choose a part to repair.',
      });

    expect(repairPart).not.toHaveBeenCalled();
  });

  it('refuses to plan a repair against an unloaded component model', async () => {
    const viewport = { meshesReady: async () => ['feetech-sts3215'] } as unknown as Viewport3DHandle;

    await expect(awaitPartModels('repair_part', viewport)).rejects.toThrow('measure a box in its place');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { labelFrames } from './labelFrameTools.mjs';
import { bridge } from './shared.mjs';
import { rendererTimeout } from '../backend/agentBridge.mjs';

vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge: vi.fn() }));

const schema = z.object(labelFrames.config.inputSchema);

beforeEach(() => vi.clearAllMocks());

describe('label_frames schema and MCP reply', () => {
  it('accepts stored frame selection and pixel-coordinate labels', () => {
    expect(schema.safeParse({ frame_set: 'frames-1', frames: ['frame-1'] }).success).toBe(true);
    expect(
      schema.safeParse({
        frame_set: 'frames-1',
        labels: [{ frame: 'frame-1', annotations: [{ instance: 'cup', classId: 1, box: [0, 0, 20, 30] }] }],
      }).success,
    ).toBe(true);
  });

  it.each([{ frame_set: '../frames' }, { frame_set: 'frames-1', frames: [] }, { frame_set: 'frames-1', labels: [] }])(
    'refuses malformed selection %j',
    (payload) => {
      expect(schema.safeParse(payload).success).toBe(false);
    },
  );

  it('keeps the renderer and tool deadlines aligned', () => {
    expect(rendererTimeout('label_frames')).toBe(60000);
  });

  it('returns the bridge images as MCP image blocks', async () => {
    vi.mocked(bridge).mockResolvedValue({
      text: '{"ok":true}',
      images: [{ view: 'frame-1', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }],
    });

    const reply = await labelFrames.handler({ frame_set: 'frames-1' });

    expect(bridge).toHaveBeenCalledWith('label_frames', { frame_set: 'frames-1' }, 60000);
    expect(reply.content).toContainEqual({ type: 'image', mimeType: 'image/jpeg', data: '/9j/2Q==' });
  });
});

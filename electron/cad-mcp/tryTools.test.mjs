import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { bridge } from './shared.mjs';
import { labelTries } from './tryTools.mjs';

vi.mock('./shared.mjs', async (importOriginal) => ({ ...(await importOriginal()), bridge: vi.fn() }));

const schema = z.object(labelTries.config.inputSchema);

describe('label_tries payload', () => {
  beforeEach(() => {
    vi.mocked(bridge).mockReset();
  });

  it('takes ids to read and labels to write, trimmed', () => {
    const payload = schema.parse({
      ids: ['try-a'],
      labels: [
        {
          id: 'try-a',
          instruction: ' put the red block in the bowl ',
          tags: ['clean'],
          segments: [{ index: 0, label: 'grasp', instruction: 'close the gripper on the block', tags: ['slow'] }],
        },
      ],
    });

    expect(payload.labels[0].instruction).toBe('put the red block in the bowl');
    expect(payload.labels[0].segments[0]).toEqual({
      index: 0,
      label: 'grasp',
      instruction: 'close the gripper on the block',
      tags: ['slow'],
    });
  });

  it('refuses a crafted id, more than 20 tries, a negative segment and an empty instruction', () => {
    expect(schema.safeParse({ ids: ['../tries'] }).success).toBe(false);
    expect(schema.safeParse({ ids: Array.from({ length: 21 }, (_, i) => `try-${i}`) }).success).toBe(false);
    expect(schema.safeParse({ labels: [{ id: 'try-a', segments: [{ index: -1 }] }] }).success).toBe(false);
    expect(schema.safeParse({ labels: [{ id: 'try-a', instruction: '  ' }] }).success).toBe(false);
  });

  it('replies with the tries as text and each filmstrip as an image', async () => {
    vi.mocked(bridge).mockResolvedValue({
      text: '{"tries":[{"id":"try-a","segments":[{"index":0,"start":0,"end":1.5,"label":"reach"}]}]}',
      images: [{ view: 'Try try-a: its filmstrip, start to end.', dataUrl: 'data:image/png;base64,AAAA' }],
    });

    const reply = await labelTries.handler({ ids: ['try-a'] });

    expect(bridge).toHaveBeenCalledWith('label_tries', { ids: ['try-a'] }, 300000);
    expect(reply.content).toEqual([
      { type: 'text', text: expect.stringContaining('"label":"reach"') },
      { type: 'text', text: 'Try try-a: its filmstrip, start to end.' },
      { type: 'image', mimeType: 'image/png', data: 'AAAA' },
    ]);
  });

  it('passes a refusal back as text', async () => {
    vi.mocked(bridge).mockResolvedValue({ ok: false, problem: 'Send ids to read, labels to write, or both.' });

    const reply = await labelTries.handler({});

    expect(reply.content[0].text).toContain('Send ids to read');
    expect(reply.content).toHaveLength(1);
  });
});

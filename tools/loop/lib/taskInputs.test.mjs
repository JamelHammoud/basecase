import { describe, expect, it } from 'vitest';
import { taskInputSignature } from './taskInputs.mjs';

describe('task evidence invalidation', () => {
  it('reconsiders changed declared source objects without reacting to unrelated commits', () => {
    const step = { title: 'Improve camera input', body: 'Inputs: `src/cameras/`\nVerify in Windows CI.' };
    const a = taskInputSignature(step, () => ({ ok: true, out: '100644 blob a\tsrc/cameras/input.ts' }));
    const unchanged = taskInputSignature(step, () => ({ ok: true, out: '100644 blob a\tsrc/cameras/input.ts' }));
    const changed = taskInputSignature(step, () => ({ ok: true, out: '100644 blob b\tsrc/cameras/input.ts' }));

    expect(unchanged).toBe(a);
    expect(changed).not.toBe(a);
  });

  it('does not freeze tasks when their source inputs cannot be established', () => {
    expect(taskInputSignature({ title: 'Feature', body: 'Build it.' }, () => ({ ok: true, out: '' }))).toBeNull();
    expect(taskInputSignature({ body: 'Edit `src/cameras/`.' }, () => ({ ok: false }))).toBeNull();
  });
});

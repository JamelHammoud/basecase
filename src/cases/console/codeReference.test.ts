import { describe, expect, it } from 'vitest';
import { codeBridgeReference } from './codeReference';

describe('the code panel reference in the agent’s prompt', () => {
  it('is generated from the bridge’s own limits, names and tokens', async () => {
    await expect(`${codeBridgeReference()}\n`).toMatchFileSnapshot('../../../electron/cad-agent-guides/codeBridge.txt');
  });
});

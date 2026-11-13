import { describe, expect, it } from 'vitest';
import { ipcErrorText } from './ipcError';

describe('IPC error text', () => {
  it('drops the IPC prefix and every exception class name', () => {
    const err = new Error("Error invoking remote method 'acp:prompt': RequestError: Internal error");

    expect(ipcErrorText(err)).toBe('Internal error');
  });

  it('keeps the plain words the main process sent', () => {
    const err = new Error(
      "Error invoking remote method 'acp:prompt': Error: Agent isn’t connected. Set one up in Settings → Agent.",
    );

    expect(ipcErrorText(err)).toBe('Agent isn’t connected. Set one up in Settings → Agent.');
  });

  it('reads thrown strings and empty errors', () => {
    expect(ipcErrorText('TypeError: fetch failed')).toBe('fetch failed');
    expect(ipcErrorText(undefined)).toBe('');
  });
});

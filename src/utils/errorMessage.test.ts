import { describe, expect, it } from 'vitest';
import { errorMessage } from './errorMessage';

describe('errorMessage', () => {
  it('reads an error as its own sentence, without the Error: prefix String() adds', () => {
    const err = new Error('The file is empty.');

    expect(String(err)).toBe('Error: The file is empty.');
    expect(errorMessage(err)).toBe('The file is empty.');
  });

  it("drops Electron's IPC wrapper and the inner Error: prefixes", () => {
    const err = new Error("Error invoking remote method 'cad:export-step': Error: Error: The kernel timed out.");

    expect(errorMessage(err)).toBe('The kernel timed out.');
  });

  it('reads thrown strings, objects with a message and nothing at all', () => {
    expect(errorMessage('Error: offline')).toBe('offline');
    expect(errorMessage({ message: 'Port 8883 refused' })).toBe('Port 8883 refused');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('');
    expect(errorMessage(null)).toBe('');
  });
});

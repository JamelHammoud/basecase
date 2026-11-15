import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RoboflowAccount } from '../components/settings/RoboflowAccount';
import { roboflowBridge, roboflowImportSource } from './roboflowBridge';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../utils/platform/transport', () => ({ electron: () => ({ roboflowCall: call }) }));

afterEach(() => call.mockReset());

describe('Roboflow bridge', () => {
  it('opens the account field before importing when the key is missing', async () => {
    call.mockResolvedValue({ saved: false });

    const open = vi.fn();

    expect(await roboflowImportSource('https://app.roboflow.com/workspace/project/2', open)).toBeNull();
    expect(open).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledExactlyOnceWith('roboflow:account', undefined);
  });

  it.each([new Uint8Array([80, 75, 3, 4]), 'UEsDBA=='])('decodes an archive delivered by IPC or HTTP', async (data) => {
    call.mockResolvedValueOnce({ saved: true }).mockResolvedValueOnce({ name: 'project-v2.zip', data });

    const open = vi.fn();
    const source = await roboflowImportSource('https://app.roboflow.com/workspace/project/2', open);

    expect(open).not.toHaveBeenCalled();
    expect(source?.kind).toBe('zip');
    expect(source?.name).toBe('project-v2.zip');
    expect([...new Uint8Array(await source!.blob.arrayBuffer())]).toEqual([80, 75, 3, 4]);
    expect(call).toHaveBeenLastCalledWith('roboflow:import', 'https://app.roboflow.com/workspace/project/2');
  });

  it('does not expose a key included in a malformed account reply', async () => {
    call.mockResolvedValue({ saved: true, key: 'secret' });
    expect(await roboflowBridge.account()).toEqual({ saved: true });
  });

  it('renders a named password field in Accounts', () => {
    const html = renderToStaticMarkup(createElement(RoboflowAccount, { focus: { field: 'roboflow', ask: 1 } }));

    expect(html).toContain('Roboflow');
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Roboflow API key"');
  });
});

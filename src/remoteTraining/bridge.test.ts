import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingPane } from '../components/settings/TrainingPane';
import { remoteTrainingBridge } from './bridge';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../utils/platform/transport', () => ({ electron: () => ({ remoteTrainingCall: call }) }));

afterEach(() => call.mockReset());

describe('remote training settings', () => {
  it('keeps only public computer fields from the main process', async () => {
    call.mockResolvedValue({
      selected: true,
      host: 'trainer.local',
      user: 'robot',
      hostKey: 'ssh-ed25519 key',
      keySaved: true,
      key: '/secret/key',
      credentials: 'secret',
    });

    expect(await remoteTrainingBridge.status()).toEqual({
      selected: true,
      host: 'trainer.local',
      user: 'robot',
      hostKey: 'ssh-ed25519 key',
      keySaved: true,
    });
  });

  it('configures one computer and switches execution back to this computer', async () => {
    const config = { host: 'trainer.local', user: 'robot', key: '/keys/training', hostKey: 'ssh-ed25519 key' };

    call.mockResolvedValueOnce({ selected: true }).mockResolvedValueOnce({ selected: false });
    expect(await remoteTrainingBridge.configure(config)).toMatchObject({ selected: true });
    expect(await remoteTrainingBridge.clear()).toMatchObject({ selected: false });
    expect(call.mock.calls).toEqual([
      ['remote-training:configure', config],
      ['remote-training:clear', undefined],
    ]);
  });

  it('names its controls and masks the existing identity path', () => {
    const html = renderToStaticMarkup(createElement(TrainingPane));

    for (const label of ['Host', 'User', 'SSH identity', 'Host key']) expect(html).toContain(`aria-label="${label}"`);

    expect(html).toContain('type="password"');
    expect(html).toContain('Connect');
    expect(html).toContain('Compare this key');
  });
});

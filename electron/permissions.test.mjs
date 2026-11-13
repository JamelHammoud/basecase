import { describe, expect, it, vi } from 'vitest';
import { trustedIpc } from './appOrigin.mjs';
import { limitPermissions, permissionPolicy, registerCameraHandlers } from './permissions.mjs';

const APP = 'app://basecase';
const policy = permissionPolicy(APP);
const fromApp = { requestingUrl: `${APP}/index.html`, isMainFrame: true };

const mediaRequest = (requestingUrl, mediaTypes, isMainFrame = true) =>
  policy.request('media', { requestingUrl, mediaTypes, isMainFrame });

describe('camera permission requests', () => {
  it('grants the app origin a video-only request', () => {
    expect(mediaRequest(`${APP}/`, ['video'])).toBe(true);
  });

  it('refuses audio, mixed and empty media requests from the app origin', () => {
    expect(mediaRequest(`${APP}/`, ['audio'])).toBe(false);
    expect(mediaRequest(`${APP}/`, ['audio', 'video'])).toBe(false);
    expect(mediaRequest(`${APP}/`, ['video', 'audio'])).toBe(false);
    expect(mediaRequest(`${APP}/`, [])).toBe(false);
    expect(mediaRequest(`${APP}/`, undefined)).toBe(false);
    expect(mediaRequest(`${APP}/`, 'video')).toBe(false);
  });

  it('refuses video to every other origin', () => {
    expect(mediaRequest('https://evil.example/', ['video'])).toBe(false);
    expect(mediaRequest('http://localhost:5173/', ['video'])).toBe(false);
    expect(mediaRequest('file:///Users/me/page.html', ['video'])).toBe(false);
    expect(mediaRequest('app://other/', ['video'])).toBe(false);
    expect(mediaRequest('data:text/html,<video>', ['video'])).toBe(false);
    expect(mediaRequest('', ['video'])).toBe(false);
    expect(policy.request('media', { mediaTypes: ['video'] })).toBe(false);
    expect(policy.request('media')).toBe(false);
  });

  it('refuses an iframe of another origin inside the app', () => {
    expect(mediaRequest('https://evil.example/frame.html', ['video'], false)).toBe(false);
  });
});

describe('camera permission checks', () => {
  it('grants the app origin video', () => {
    expect(policy.check('media', APP, { mediaType: 'video' })).toBe(true);
  });

  it('refuses audio and unknown media to the app origin', () => {
    expect(policy.check('media', APP, { mediaType: 'audio' })).toBe(false);
    expect(policy.check('media', APP, { mediaType: 'unknown' })).toBe(false);
    expect(policy.check('media', APP, {})).toBe(false);
    expect(policy.check('media', APP)).toBe(false);
  });

  it('refuses video to every other origin', () => {
    expect(policy.check('media', 'https://evil.example', { mediaType: 'video' })).toBe(false);
    expect(policy.check('media', 'file:///Users/me/page.html', { mediaType: 'video' })).toBe(false);
    expect(policy.check('media', 'app://other', { mediaType: 'video' })).toBe(false);
    expect(policy.check('media', '', { mediaType: 'video' })).toBe(false);
    expect(policy.check('media', undefined, { mediaType: 'video' })).toBe(false);
  });
});

describe('other permissions', () => {
  it('keeps clipboard writes and fullscreen for the app origin only', () => {
    for (const permission of ['clipboard-sanitized-write', 'fullscreen']) {
      expect(policy.request(permission, fromApp)).toBe(true);
      expect(policy.check(permission, APP, {})).toBe(true);
      expect(policy.request(permission, { requestingUrl: 'https://evil.example/' })).toBe(false);
      expect(policy.check(permission, 'https://evil.example', {})).toBe(false);
    }
  });

  it('refuses everything else, even to the app origin', () => {
    for (const permission of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'hid']) {
      expect(policy.request(permission, fromApp)).toBe(false);
      expect(policy.check(permission, APP, {})).toBe(false);
    }
  });
});

describe('session wiring', () => {
  it('routes both handlers through the policy', () => {
    const session = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() };

    limitPermissions(session, APP);

    const [onRequest] = session.setPermissionRequestHandler.mock.calls[0];
    const [onCheck] = session.setPermissionCheckHandler.mock.calls[0];
    const callback = vi.fn();

    onRequest(null, 'media', callback, { requestingUrl: 'https://evil.example/', mediaTypes: ['video'] });
    onRequest(null, 'media', callback, { requestingUrl: `${APP}/`, mediaTypes: ['audio', 'video'] });
    onRequest(null, 'media', callback, { requestingUrl: `${APP}/`, mediaTypes: ['video'] });
    expect(callback.mock.calls).toEqual([[false], [false], [true]]);
    expect(onCheck(null, 'media', 'https://evil.example', { mediaType: 'video' })).toBe(false);
    expect(onCheck(null, 'media', APP, { mediaType: 'audio' })).toBe(false);
    expect(onCheck(null, 'media', APP, { mediaType: 'video' })).toBe(true);
  });
});

describe('camera access', () => {
  const handlerFor = (platform, granted) => {
    const ipcMain = { handle: vi.fn() };
    const systemPreferences = { askForMediaAccess: vi.fn(async () => granted) };

    registerCameraHandlers(ipcMain, { platform, systemPreferences });

    const [channel, handler] = ipcMain.handle.mock.calls[0];

    return { channel, handler, systemPreferences };
  };

  it('asks macOS for the camera only', async () => {
    const { channel, handler, systemPreferences } = handlerFor('darwin', false);

    expect(channel).toBe('camera:access');
    await expect(handler()).resolves.toBe(false);
    expect(systemPreferences.askForMediaAccess).toHaveBeenCalledWith('camera');
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalledWith('microphone');
  });

  it('answers true on macOS once granted, and on other platforms without asking', async () => {
    await expect(handlerFor('darwin', true).handler()).resolves.toBe(true);

    const windows = handlerFor('win32', false);

    await expect(windows.handler()).resolves.toBe(true);
    expect(windows.systemPreferences.askForMediaAccess).not.toHaveBeenCalled();
  });

  it('refuses to ask for a frame outside the app', async () => {
    const raw = { handle: vi.fn() };
    const systemPreferences = { askForMediaAccess: vi.fn(async () => true) };

    registerCameraHandlers(trustedIpc(raw, APP), { platform: 'darwin', systemPreferences });

    const [, handler] = raw.handle.mock.calls[0];
    const evil = { senderFrame: { url: 'https://evil.example/', parent: null } };
    const appIframe = { senderFrame: { url: `${APP}/`, parent: {} } };

    expect(() => handler(evil)).toThrow(/Refused camera:access/);
    expect(() => handler(appIframe)).toThrow(/Refused camera:access/);
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled();
    await expect(handler({ senderFrame: { url: `${APP}/`, parent: null } })).resolves.toBe(true);
  });
});

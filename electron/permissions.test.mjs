import { describe, expect, it, vi } from 'vitest';
import { installPermissions } from './permissions.mjs';

describe('camera permission', () => {
  const app = 'http://localhost:5173';
  const video = { requestingUrl: `${app}/`, mediaTypes: ['video'] };

  const installed = ({ platform = 'win32', status = 'not-determined', answer = true } = {}) => {
    const handlers = {};
    const systemPreferences = {
      getMediaAccessStatus: vi.fn(() => status),
      askForMediaAccess: vi.fn(async () => answer),
    };
    const ses = {
      setPermissionRequestHandler: (fn) => (handlers.request = fn),
      setPermissionCheckHandler: (fn) => (handlers.check = fn),
    };

    installPermissions(ses, { appOrigin: app, platform, systemPreferences });

    const request = (permission, details) =>
      new Promise((resolve) => handlers.request(null, permission, resolve, details));

    return { request, check: handlers.check, systemPreferences };
  };

  it('grants video to the app origin and refuses other origins and any audio', async () => {
    const { request, systemPreferences } = installed();
    const refused = [
      { ...video, requestingUrl: 'https://evil.example/' },
      { ...video, requestingUrl: 'http://localhost:5174/' },
      { ...video, mediaTypes: ['audio'] },
      { ...video, mediaTypes: ['video', 'audio'] },
      { ...video, mediaTypes: [] },
      { requestingUrl: video.requestingUrl },
    ];

    for (const details of refused) expect(await request('media', details), JSON.stringify(details)).toBe(false);

    expect(await request('media', video)).toBe(true);
    expect(await request('geolocation', video)).toBe(false);
    expect(await request('fullscreen', video)).toBe(true);
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled();
  });

  it('asks macOS for the camera and keeps its answer', async () => {
    const asked = installed({ platform: 'darwin', answer: false });

    expect(await asked.request('media', video)).toBe(false);
    expect(asked.systemPreferences.askForMediaAccess).toHaveBeenCalledWith('camera');
    expect(await installed({ platform: 'darwin' }).request('media', video)).toBe(true);
    expect(await installed({ platform: 'darwin', status: 'denied' }).request('media', video)).toBe(false);
    expect(await installed({ platform: 'darwin', status: 'restricted' }).request('media', video)).toBe(false);
  });

  it('checks media only for the app origin’s video', () => {
    const { check } = installed();

    expect(check(null, 'media', app, { mediaType: 'video' })).toBe(true);
    expect(check(null, 'media', app, { mediaType: 'audio' })).toBe(false);
    expect(check(null, 'media', 'https://evil.example', { mediaType: 'video' })).toBe(false);
    expect(check(null, 'media', 'http://localhost:5174', { mediaType: 'video' })).toBe(false);
    expect(check(null, 'clipboard-sanitized-write', app, {})).toBe(true);
  });
});

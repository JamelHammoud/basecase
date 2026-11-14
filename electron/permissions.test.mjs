import { describe, expect, it, vi } from 'vitest';
import { installPermissions } from './permissions.mjs';

describe('media and device permissions', () => {
  const app = 'http://localhost:5173';
  const video = { requestingUrl: `${app}/`, mediaTypes: ['video'] };
  const audio = { requestingUrl: `${app}/`, mediaTypes: ['audio'] };
  const both = { requestingUrl: `${app}/`, mediaTypes: ['video', 'audio'] };

  const installed = ({ platform = 'win32', status = 'not-determined', answer = true } = {}) => {
    const handlers = {};
    const statusOf = typeof status === 'function' ? status : () => status;
    const answerOf = typeof answer === 'function' ? answer : () => answer;
    const systemPreferences = {
      getMediaAccessStatus: vi.fn(statusOf),
      askForMediaAccess: vi.fn(async (device) => answerOf(device)),
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

  it('grants video, audio or both to the app origin and refuses other origins and other types', async () => {
    const { request, systemPreferences } = installed();
    const refused = [
      { ...video, requestingUrl: 'https://evil.example/' },
      { ...video, requestingUrl: 'http://localhost:5174/' },
      { ...audio, requestingUrl: 'https://evil.example/' },
      { ...audio, requestingUrl: 'http://localhost:5174/' },
      { ...both, requestingUrl: 'https://evil.example/' },
      { ...video, mediaTypes: [] },
      { ...video, mediaTypes: ['screen'] },
      { ...video, mediaTypes: ['audio', 'desktop'] },
      { ...video, mediaTypes: 'audio' },
      { requestingUrl: video.requestingUrl },
    ];

    for (const details of refused) expect(await request('media', details), JSON.stringify(details)).toBe(false);

    expect(await request('media', video)).toBe(true);
    expect(await request('media', audio)).toBe(true);
    expect(await request('media', both)).toBe(true);
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

  it('asks macOS for the microphone and refuses when any device asked for is refused', async () => {
    const asked = installed({ platform: 'darwin' });

    expect(await asked.request('media', audio)).toBe(true);
    expect(asked.systemPreferences.askForMediaAccess).toHaveBeenCalledWith('microphone');
    expect(asked.systemPreferences.askForMediaAccess).not.toHaveBeenCalledWith('camera');
    expect(await installed({ platform: 'darwin', answer: false }).request('media', audio)).toBe(false);
    expect(await installed({ platform: 'darwin', status: 'denied' }).request('media', audio)).toBe(false);

    const noMicrophone = installed({ platform: 'darwin', answer: (device) => device !== 'microphone' });
    const micRestricted = installed({
      platform: 'darwin',
      status: (device) => (device === 'microphone' ? 'restricted' : 'granted'),
    });

    expect(await noMicrophone.request('media', both)).toBe(false);
    expect(await micRestricted.request('media', both)).toBe(false);
    expect(await installed({ platform: 'darwin' }).request('media', both)).toBe(true);
  });

  it('allows Web MIDI to the app origin only, and never system exclusive', async () => {
    const { request, check } = installed();

    expect(await request('midi', { requestingUrl: `${app}/` })).toBe(true);
    expect(await request('midi', { requestingUrl: 'https://evil.example/' })).toBe(false);
    expect(await request('midi', { requestingUrl: 'http://localhost:5174/' })).toBe(false);
    expect(await request('midiSysex', { requestingUrl: `${app}/` })).toBe(false);
    expect(check(null, 'midi', app, {})).toBe(true);
    expect(check(null, 'midi', 'https://evil.example', {})).toBe(false);
    expect(check(null, 'midiSysex', app, {})).toBe(false);
  });

  it('checks media only for the app origin’s video and audio', () => {
    const { check } = installed();

    expect(check(null, 'media', app, { mediaType: 'video' })).toBe(true);
    expect(check(null, 'media', app, { mediaType: 'audio' })).toBe(true);
    expect(check(null, 'media', app, { mediaType: 'unknown' })).toBe(false);
    expect(check(null, 'media', app, {})).toBe(false);
    expect(check(null, 'media', 'https://evil.example', { mediaType: 'video' })).toBe(false);
    expect(check(null, 'media', 'https://evil.example', { mediaType: 'audio' })).toBe(false);
    expect(check(null, 'media', 'http://localhost:5174', { mediaType: 'audio' })).toBe(false);
    expect(check(null, 'clipboard-sanitized-write', app, {})).toBe(true);
  });
});

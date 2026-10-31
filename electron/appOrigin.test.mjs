import { describe, expect, it } from 'vitest';
import { isAppUrl, isExternalWebUrl, originOf } from './appOrigin.mjs';

describe('app origin', () => {
  it('treats the app:// scheme as one origin', () => {
    expect(originOf('app://basecase/index.html?x=1')).toBe('app://basecase');
    expect(isAppUrl('app://basecase/assets/index.js', 'app://basecase')).toBe(true);
    expect(isAppUrl('app://other/', 'app://basecase')).toBe(false);
    expect(isAppUrl('http://localhost:5173/', 'app://basecase')).toBe(false);
  });

  it('never trusts opaque origins', () => {
    expect(isAppUrl('file:///tmp/x.html', 'file:///tmp/y.html')).toBe(false);
    expect(isAppUrl('data:text/html,hi', 'app://basecase')).toBe(false);
    expect(isAppUrl('not a url', 'app://basecase')).toBe(false);
  });

  it('opens only web links outside the app', () => {
    expect(isExternalWebUrl('https://example.com')).toBe(true);
    expect(isExternalWebUrl('app://basecase/')).toBe(false);
  });
});

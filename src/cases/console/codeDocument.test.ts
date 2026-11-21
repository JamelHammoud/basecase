import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CODE_PANEL_TOKENS } from '../../design-system/codeTokens';
import { CODE_PANEL_CSP, CODE_PANEL_SANDBOX, codePanelDocument, codeSourceFirstLine } from './codeDocument';

describe('a code panel’s document', () => {
  const source =
    '<meta http-equiv="Content-Security-Policy" content="default-src *"><script>basecase.event("go")</script>';
  const doc = codePanelDocument(source);

  it('writes the policy ahead of the client and the code, and the code last', () => {
    const policy = doc.indexOf('http-equiv="Content-Security-Policy"');

    expect(policy).toBeGreaterThan(0);
    expect(policy).toBeLessThan(doc.indexOf('<script>'));
    expect(doc.indexOf('content="script-src \'unsafe-inline\'"')).toBeLessThan(doc.indexOf('<script>'));
    expect(doc).toContain('content="script-src \'unsafe-inline\'"');
    expect(doc).toContain('basecase.event("go")</script>');
    expect(CODE_PANEL_CSP.split('; ')).toEqual([
      "default-src 'none'",
      "script-src 'none'",
      "style-src 'unsafe-inline'",
      'img-src data: blob:',
      'media-src data: blob:',
      'font-src data:',
      "base-uri 'none'",
      "form-action 'none'",
    ]);
    expect(CODE_PANEL_SANDBOX).toBe('allow-scripts');
  });

  it('gives the code the studio’s greys, accent, type sizes and radii as CSS variables', () => {
    for (const name of ['--bc-panel', '--bc-accent', '--bc-ink', '--bc-text', '--bc-radius'])
      expect(doc).toContain(`${name}:${CODE_PANEL_TOKENS[name as keyof typeof CODE_PANEL_TOKENS]}`);

    expect(CODE_PANEL_TOKENS['--bc-accent']).toBe('#0d99ff');
  });

  it('knows the document line the code starts on, so an error’s line counts from the code’s first line', () => {
    const lines = codePanelDocument('<p>one</p>\n<p>two</p>').split('\n');

    expect(lines[codeSourceFirstLine() - 1].endsWith('<p>one</p>')).toBe(true);
    expect(lines[codeSourceFirstLine()]).toBe('<p>two</p>');
  });
});

it.each(['"left>right"', "'left>right'"])(
  'keeps quoted script attributes intact and hashes the actual script body: %s',
  (attribute) => {
    const open = `<script data-label=${attribute}>`;
    const doc = codePanelDocument(`${open}window.ran = true;\r\n</script>`);
    const script = doc.slice(doc.indexOf(open) + open.length, doc.lastIndexOf('</script>'));
    const window = {};

    expect(doc).toContain(open);
    expect(script).toContain('window.ran = true;\n');
    expect(doc).toContain(`'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    runInNewContext(script, { window });
    expect(window).toHaveProperty('ran', true);
    expect(Object.getOwnPropertyDescriptor(window, 'RTCPeerConnection')?.writable).toBe(false);
  },
);

it.each(['application/json', 'application/ld+json', 'importmap'])(
  'preserves nonexecutable %s data scripts without authorizing them as code',
  (type) => {
    const data = '{"label":"turn left"}';
    const source = `<script type="${type}">${data}</script>`;
    const doc = codePanelDocument(source);

    expect(doc.endsWith(source)).toBe(true);
    expect(doc).not.toContain(createHash('sha256').update(data).digest('base64'));
  },
);

it('blocks both peer connection constructors before panel code and prevents restoring them without CSP support', () => {
  const connect = vi.fn();
  const context = {
    window: {
      RTCPeerConnection: connect,
      webkitRTCPeerConnection: connect,
      parent: { postMessage: vi.fn() },
      addEventListener: vi.fn(),
    },
  };
  const scripts = codePanelDocument(`<script>
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
      try { new window[name]({ iceServers: [{ urls: 'turn:127.0.0.1:3478' }] }); } catch {}
      if (typeof window[name] !== 'undefined') throw new Error(name + ' is available');
      if (Reflect.deleteProperty(window, name)) throw new Error(name + ' can be deleted');
      if (Reflect.set(window, name, Function)) throw new Error(name + ' can be replaced');
      try { Object.defineProperty(window, name, { value: Function }); } catch {}
      if (typeof window[name] !== 'undefined') throw new Error(name + ' was restored');
    }
  </script>`).matchAll(/<script>([\s\S]*?)<\/script>/g);

  for (const [, script] of scripts) runInNewContext(script, context);

  expect(connect).not.toHaveBeenCalled();
});

it('authorizes only scripts that lock WebRTC first, including reused scripts in descendants', () => {
  const doc = codePanelDocument('<script>window.ran = true;</script>');
  const policy = doc.match(/content="([^"]+)"/)![1];
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

  expect(policy.match(/script-src ([^;]+)/)![1]).not.toContain('unsafe-inline');
  expect(policy).not.toContain('unsafe-eval');

  for (const script of scripts) {
    const hash = createHash('sha256').update(script).digest('base64');
    const window = { parent: { postMessage: vi.fn() }, addEventListener: vi.fn() };

    expect(policy).toContain(`'sha256-${hash}'`);
    runInNewContext(script, { window });
    expect(Object.getOwnPropertyDescriptor(window, 'RTCPeerConnection')).toMatchObject({
      value: undefined,
      writable: false,
      configurable: false,
    });
  }

  expect(policy).not.toContain(createHash('sha256').update('window.ran = true;').digest('base64'));
});

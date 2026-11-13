import { describe, expect, it } from 'vitest';
import { CODE_PANEL_TOKENS } from '../../design-system/codeTokens';
import { CODE_PANEL_CSP, CODE_PANEL_SANDBOX, codePanelDocument } from './codeDocument';

describe('a code panel’s document', () => {
  const source =
    '<meta http-equiv="Content-Security-Policy" content="default-src *"><script>basecase.event("go")</script>';
  const doc = codePanelDocument(source);

  it('writes the policy ahead of the client and the code, and the code last', () => {
    const policy = doc.indexOf(`content="${CODE_PANEL_CSP}"`);

    expect(policy).toBeGreaterThan(0);
    expect(policy).toBeLessThan(doc.indexOf('<script>'));
    expect(doc.endsWith(source)).toBe(true);
    expect(CODE_PANEL_CSP.split('; ')).toEqual([
      "default-src 'none'",
      "script-src 'unsafe-inline'",
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
});

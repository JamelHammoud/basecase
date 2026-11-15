import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'));

vi.stubEnv('BASECASE_LOOP_DIR', workspace);

const {
  keepsMarkers,
  kindOf,
  lastMarkdown,
  plainPunctuation,
  punctuationProblems,
  restoreMenuPaths,
  rewriteFile,
  voiceText,
} = await import('./voice.mjs');

afterAll(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const post =
  '---\ntitle: Snap parts\ndate: 2026-11-13\n---\n\nYou can now snap parts. Steps are in [Snap](/help/snap).';
const reply = (text) => ({ ok: true, output: { text } });

describe('the voice pipeline', () => {
  it('takes the last markdown block from a model reply', () => {
    expect(lastMarkdown('Scores\n```markdown\nfirst\n```\nthen\n```markdown\nsecond\n```')).toBe('second');
    expect(lastMarkdown('no block')).toBeNull();
  });

  it('knows the site folders it writes', () => {
    expect(kindOf('site/content/changelog/2026-11-13-snap.md')).toBe('changelog');
    expect(kindOf('site/content/help/snap.md')).toBe('help');
    expect(kindOf('src/App.tsx')).toBeNull();
  });

  it('applies drafting, stop-slop and humanizer guidance in one isolated provider-routed call', () => {
    const systems = [];
    const generate = (options) => {
      systems.push(options.system);
      expect(options.name).toBe('voice');
      expect(options.sandbox.tools).toEqual([]);

      return reply(post.replace('snap parts.', `snap parts (${systems.length}).`));
    };

    expect(voiceText(post, { kind: 'changelog', generate })).toContain('(1)');
    expect(systems).toHaveLength(1);
    expect(systems[0]).toContain('Mannered prose substitutes');
    expect(systems[0]).toContain('changelog posts');
    expect(systems[0]).toContain('# Stop Slop');
    expect(systems[0]).toContain('# Humanizer');
  });

  it('runs only humanizer on a pull request or issue', () => {
    const systems = [];
    const generate = (options) => {
      systems.push(options.system);

      return reply('Closes #226.\n\nDragging a part snaps it.');
    };

    expect(voiceText('Closes #226.\n\nDragging a part now snaps it.', { kind: 'pull', generate })).toBe(
      'Closes #226.\n\nDragging a part snaps it.',
    );
    expect(systems).toHaveLength(1);
  });

  it('keeps the original when a rewrite loses a machine-read line or link', () => {
    expect(keepsMarkers('Closes #5.\ncopy: "Add" — a button', 'Closes #5.', 'pull')).toBe(false);
    expect(keepsMarkers(post, post.replace('/help/snap', '/help/other'), 'changelog')).toBe(false);
    expect(keepsMarkers(post, post.replace('title: Snap parts', 'title: Snap It In'), 'changelog')).toBe(true);
    expect(keepsMarkers(post, post.replace('title: Snap parts', 'title: Other'), 'help')).toBe(false);
  });

  it('ends every rewrite without semicolons or em dashes, leaving code alone', () => {
    expect(plainPunctuation('One thing; another — and `a; b`.\n```\nx; y\n```')).toBe(
      'One thing. Another, and `a; b`.\n```\nx; y\n```',
    );
    expect(punctuationProblems('One; two — three')).toEqual(['a semicolon', 'an em dash']);
  });

  it('puts back the bold on a menu path the rewrite dropped, and keeps a help article that lost a bold label', () => {
    expect(restoreMenuPaths('Open **File** ▸ **Import**.', 'Choose File ▸ Import to start.')).toBe(
      'Choose **File** ▸ **Import** to start.',
    );
    expect(keepsMarkers('Click **Add Printer**.', 'Click Add Printer.', 'help')).toBe(false);
    expect(keepsMarkers('Click **Add Printer**.', 'Click Add Printer.', 'changelog')).toBe(true);
  });

  it('leaves a reference article alone, since its lists must match the app exactly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const file = 'site/content/help/keyboard-shortcuts.md';

    fs.mkdirSync(path.join(dir, 'site/content/help'), { recursive: true });
    fs.writeFileSync(path.join(dir, file), '---\ntitle: Keyboard shortcuts\ntype: reference\n---\n\n| Key | Does |');

    expect(rewriteFile(file, { cwd: dir, generate: () => ({ ok: false }) })).toBe(false);
  });
});

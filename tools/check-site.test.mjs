import { describe, expect, it } from 'vitest';
import { blocksOf, sentencesOf, wordCount } from './site/blocks.mjs';
import { labelIndex } from './copy/labels.mjs';
import { formatProblem, lintSite } from './site/lint.mjs';

const page = (front, body) => `---\n${front}\n---\n\n${body}\n`;

const HELP = page('title: Import a mesh\ndate: 2026-11-12', 'Bring a model in.\n\n1. Choose **Import Mesh**.');

const lint = (files, existing = []) =>
  lintSite({
    files: Object.entries({ 'site/content/help/import-a-mesh.md': HELP, ...files }).map(([path, source]) => ({
      path,
      source,
    })),
    exists: (src) => existing.includes(src),
  }).map(formatProblem);

const LONG =
  'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen';
const TOO_LONG = `${LONG} eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six.`;

describe('blocksOf', () => {
  it('reads paragraphs, list items and headings with their line numbers, skipping code', () => {
    const source = page(
      'title: X\ndate: 2026-11-12',
      'First line\ncontinues here.\n\n## Heading\n\n```\nnot prose\n```\n\n1. A step.\n2. Another.',
    );

    expect(blocksOf(source).map(({ kind, text, line }) => [kind, text, line])).toEqual([
      ['paragraph', 'First line continues here.', 6],
      ['heading', 'Heading', 9],
      ['item', 'A step.', 15],
      ['item', 'Another.', 16],
    ]);
  });

  it('counts words and splits sentences without markup', () => {
    expect(sentencesOf('Open [Import a robot](/help/import-a-robot). Then `robot.urdf` loads.')).toEqual([
      'Open Import a robot.',
      'Then code loads.',
    ]);
    expect(wordCount('Choose Export ▸ Robot Package in ⌘K.')).toBe(6);
  });
});

describe('lintSite', () => {
  it('passes a page that follows §3f', () => {
    const entry = page(
      'title: Import meshes\ndate: 2026-11-12\nimage: /changelog/import-meshes/cover.png',
      'You can now import a mesh.\n\n![The Import Mesh menu item](/changelog/import-meshes/menu.png)\n\nSteps are in [Import a mesh](/help/import-a-mesh).',
    );

    expect(
      lint({ 'site/content/changelog/2026-11-12-import-meshes.md': entry }, [
        '/changelog/import-meshes/cover.png',
        '/changelog/import-meshes/menu.png',
      ]),
    ).toEqual([]);
  });

  it('fails semicolons, em dashes, long paragraphs and a long first paragraph in changelog entries, not long sentences', () => {
    const entry = page(
      'title: Old\ndate: 2026-11-01',
      `${TOO_LONG}\n\nA. B. C. D. E. F.\n\nOne thing; another — and a third.`,
    );

    expect(lint({ 'site/content/changelog/2026-11-01-old.md': entry })).toEqual([
      'site/content/changelog/2026-11-01-old.md:10: a semicolon: end the sentence or join it with a word (§3f)',
      'site/content/changelog/2026-11-01-old.md:10: an em dash: use a comma, a full stop or parentheses (§3f)',
      'site/content/changelog/2026-11-01-old.md:8: a paragraph of 6 sentences; keep it to 5 (§3f)',
    ]);
    expect(
      lint({ 'site/content/changelog/2026-11-01-old.md': page('title: Old\ndate: 2026-11-01', 'A. B. C.') }),
    ).toEqual([
      'site/content/changelog/2026-11-01-old.md:6: the first paragraph has 3 sentences; the list shows it alone, so keep it to 2',
    ]);
  });

  it('asks entries from the help center on to link their help article', () => {
    const entry = page('title: New\ndate: 2026-11-12', 'You can now do it.');

    expect(lint({ 'site/content/changelog/2026-11-12-new.md': entry })).toEqual([
      'site/content/changelog/2026-11-12-new.md:1: link the help article for this change by its title (§3f)',
    ]);
  });

  it('fails marketing words, vague link text, broken page links and missing images', () => {
    const post = page(
      'title: A post\ndate: 2026-11-12\nimage: /blog/missing.png',
      'A seamless export. Read [here](/help/import-a-mesh) or [Gone](/help/gone).\n\n![screenshot](/blog/shot.png)',
    );

    expect(lint({ 'site/content/blog/a-post.md': post })).toEqual([
      'site/content/blog/a-post.md:7: “seamless” is on the banned list; say the specific thing (§3f)',
      "site/content/blog/a-post.md:7: link text “here” doesn't say where it goes",
      'site/content/blog/a-post.md:7: link to /help/gone goes to no page in site/content',
      "site/content/blog/a-post.md:1: cover /blog/missing.png isn't in site/public",
      "site/content/blog/a-post.md:9: image /blog/shot.png isn't in site/public",
      "site/content/blog/a-post.md:9: image /blog/shot.png needs alt text that says what's on screen",
    ]);
  });

  it('fails British spellings in prose, titles and alt text, but not in code or front-matter keywords', () => {
    const help = page(
      'title: Find the centre of mass\ndate: 2026-11-12\nkeywords:\n  - colour',
      'Each part is `coloured` by its grey level.\n\n![Dots labelled by joint](/help/import-a-mesh/dots.png)',
    );

    expect(lint({ 'site/content/help/import-a-mesh.md': help }, ['/help/import-a-mesh/dots.png'])).toEqual([
      'site/content/help/import-a-mesh.md:1: “centre” is British; spell it “center” (§3b-20)',
      'site/content/help/import-a-mesh.md:8: “grey” is British; spell it “gray” (§3b-20)',
      'site/content/help/import-a-mesh.md:10: “labelled” is British; spell it “labeled” (§3b-20)',
    ]);
  });

  it('fails a negative written out in full in prose and titles, but not in code or front-matter keywords', () => {
    const help = page(
      'title: When a print does not start\ndate: 2026-11-12\nkeywords:\n  - cannot',
      "Do not start a print with anything on the bed. It won't start when `is not` shows.",
    );

    expect(lint({ 'site/content/help/import-a-mesh.md': help })).toEqual([
      'site/content/help/import-a-mesh.md:1: write “does not” as “doesn’t” (§3b-24)',
      'site/content/help/import-a-mesh.md:8: write “Do not” as “Don’t” (§3b-24)',
    ]);
  });

  it('fails a blog sentence copied from a changelog entry', () => {
    const sentence = 'The token stays in the main process, encrypted on disk.';
    const entry = page('title: Hub\ndate: 2026-11-01', `You can publish.\n\n${sentence}`);
    const post = page('title: Hub story\ndate: 2026-11-12', `We built it.\n\n${sentence}`);

    expect(lint({ 'site/content/changelog/2026-11-01-hub.md': entry, 'site/content/blog/hub-story.md': post })).toEqual(
      [
        'site/content/blog/hub-story.md:8: “The token stays in the main process, encrypted on disk.…” is copied from the changelog; link the entry instead',
      ],
    );
  });

  it('fails titles that are too long, end in punctuation, or start a help task with How to or -ing', () => {
    const help = (title) => ({ [`site/content/help/x.md`]: page(`title: ${title}\ndate: 2026-11-12`, 'Do it.') });

    expect(lint(help('How to import a mesh'))).toEqual([
      'site/content/help/x.md:1: “How to import a mesh”: start a task title with its verb, not “How to” or an -ing word (§3f)',
    ]);
    expect(lint(help('Importing meshes'))).toHaveLength(1);
    expect(lint(help('Why is my robot red?'))).toEqual(['site/content/help/x.md:1: the title ends in “?”; drop it']);
    expect(lint(help('Bring a robot in'))).toEqual([]);
    expect(lint(help('A'.repeat(66)))).toEqual([
      'site/content/help/x.md:1: the title has 66 characters; keep it to 65',
    ]);
  });
});

describe('key caps and labels', () => {
  it('fails a help key outside a key cap, and Windows keys written by hand', () => {
    const help = (body) => ({ 'site/content/help/x.md': page('title: Open a scene\ndate: 2026-11-12', body) });

    expect(lint(help('1. Press ⌘K, then press Enter.'))).toEqual([
      'site/content/help/x.md:6: write “⌘K” as a key cap, [[⌘K]] (§3f)',
    ]);
    expect(lint(help('1. Type the name and press Enter.'))).toEqual([
      'site/content/help/x.md:6: write Enter as a key cap, [[↩]] (§3f)',
    ]);
    expect(lint(help('1. Press [[⌘,]] (Ctrl+, on Windows).'))).toEqual([
      'site/content/help/x.md:6: key caps show Windows keys on Windows; drop the Ctrl version (§3f)',
    ]);
    expect(
      lint(help('1. Press [[⇧⌘Z]], then [[↩]], `⌘K` in code.\n\n![The ⌘K menu](/help/x/menu.png)'), [
        '/help/x/menu.png',
      ]),
    ).toEqual([]);
  });

  it('fails a label the app lacks in help and changelog pages, not in blog posts', () => {
    const labels = labelIndex({ strings: ['Import Mesh', 'Delete Marks'], keys: ['⌘K'] });
    const body =
      'You can now clear them.\n\nClick **Clear Marks**.\n\nSteps are in [Import a mesh](/help/import-a-mesh).';
    const files = Object.entries({
      'site/content/help/import-a-mesh.md': HELP,
      'site/content/changelog/2026-11-12-marks.md': page('title: Clear marks\ndate: 2026-11-12', body),
      'site/content/blog/marks.md': page('title: Marks\ndate: 2026-11-12', body),
    }).map(([path, source]) => ({ path, source }));

    expect(lintSite({ files, exists: () => true, labels }).map(formatProblem)).toEqual([
      'site/content/changelog/2026-11-12-marks.md:8: **Clear Marks** names no label in the app; the closest is “Delete Marks” (§3f)',
    ]);
  });
});

describe('menu paths', () => {
  it('fails a menu path with a plain segment or one bold span, but not a quoted message or alt text', () => {
    const help = (body) => ({ 'site/content/help/x.md': page('title: Open a scene\ndate: 2026-11-12', body) });
    const problem = 'site/content/help/x.md:6: write each label in a menu path in bold, **File** ▸ **Import** (§3f)';

    expect(lint(help('1. Choose File ▸ **Import**.'))).toEqual([problem]);
    expect(lint(help('1. Choose **File ▸ Import**.'))).toEqual([problem]);
    expect(lint(help('| Mesh | Settings ▸ **Canvas** |'))).toEqual([problem]);
    expect(
      lint(
        help(
          '1. Choose **File** ▸ **Import**, then **View** ▸ **Camera** ▸ **Reset View**.\n\n## “Add it in Settings ▸ Printers.”\n\n![Settings ▸ Printers](/help/x/p.png)',
        ),
        ['/help/x/p.png'],
      ),
    ).toEqual([]);
  });

  it('fails a menu path joined by an arrow, but not a quoted message, a key cap or a change in numbers', () => {
    const help = (body) => ({ 'site/content/help/x.md': page('title: Open a scene\ndate: 2026-11-12', body) });
    const problem =
      'site/content/help/x.md:6: join the labels of a menu path with ▸, **Settings** ▸ **Accounts** (§3f)';

    expect(lint(help('1. Open **Settings** → **Accounts**.'))).toEqual([problem]);
    expect(lint(help('1. On the printer, open Settings > Network.'))).toEqual([problem]);
    expect(
      lint(help('## “It’s on the printer: Settings → Device.”\n\nPress [[→]] to go on, from 130 → 119 mm.')),
    ).toEqual([]);
  });
});

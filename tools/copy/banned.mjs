import { BANNED_COPY } from '../../verify/rehearsal/uiRules.ts';
import { APOSTROPHE_COPY } from './apostrophe.mjs';
import { AT_COPY } from './at.mjs';
import { isUserFacing } from './extract.mjs';
import { GLOSSARY_COPY } from './glossary.mjs';
import { MINUS_COPY } from './minus.mjs';
import { SPELLING_COPY } from './spelling.mjs';

export const FIXES = {
  '\\byet\\b': 'Cut it: “No parts”, not “No parts yet”.',
  '\\bplease\\b': 'Cut it.',
  '\\bsimply\\b': 'Cut it.',
  '\\beasily\\b': 'Cut it.',
  '\\bsuccessfully\\b': 'Cut it: “Saved”, not “Saved successfully”.',
  '\\boops\\b': 'State the problem and the fix.',
  '\\buh-oh\\b': 'State the problem and the fix.',
  '\\binvalid\\b': 'Say what to do instead.',
  '\\berror:': 'Say what to do instead.',
  'will appear here|show up here': 'Omit it, or name the action.',
  'tried in simulation only': 'Cut it; show the measured limit next to the result.',
  '\\bclick here\\b': 'Describe the destination.',
  '^learn more$': 'Describe the destination.',
  ' [·•|] ': 'Separate items with layout (§3b-16).',
};

export const LINTED_COPY = [
  ...BANNED_COPY.filter(([source]) => source in FIXES).map(([source, flags]) => ({
    pattern: new RegExp(source, flags),
    fix: FIXES[source],
    section: '§3c',
  })),
  ...GLOSSARY_COPY,
  ...SPELLING_COPY,
  ...APOSTROPHE_COPY,
  ...MINUS_COPY,
  ...AT_COPY,
];

const isId = (text) => /\p{L}{2,}/u.test(text) && !isUserFacing(text);

export function findBannedCopy(text, { afterValue = false } = {}) {
  if (isId(text)) return null;

  for (const entry of LINTED_COPY) {
    const pattern = afterValue ? (entry.afterValue ?? entry.pattern) : entry.pattern;
    const match = pattern.exec(text) ?? pattern.exec(text.trim());
    const { fix, section } = entry;

    if (match) return { word: match[0].trim(), fix, section };
  }

  return null;
}

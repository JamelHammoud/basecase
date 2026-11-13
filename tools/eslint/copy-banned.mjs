export const BANNED_COPY = [
  { pattern: /\byet\b/i, word: 'yet', fix: 'Cut it: “No parts”, not “No parts yet”.' },
  { pattern: /\bplease\b/i, word: 'please', fix: 'Cut it.' },
  { pattern: /\bsimply\b/i, word: 'simply', fix: 'Cut it.' },
  { pattern: /\beasily\b/i, word: 'easily', fix: 'Cut it.' },
  { pattern: /\bsuccessfully\b/i, word: 'successfully', fix: 'Cut it: “Saved”, not “Saved successfully”.' },
  { pattern: /\boops\b/i, word: 'Oops', fix: 'State the problem and the fix.' },
  { pattern: /\buh-oh\b/i, word: 'Uh-oh', fix: 'State the problem and the fix.' },
  { pattern: /(?<![\w-])invalid(?![\w-])/i, word: 'Invalid', fix: 'Say what to do instead.' },
  { pattern: /\bwill appear here\b/i, word: 'will appear here', fix: 'Omit it, or name the action.' },
  { pattern: /\bshows? up here\b/i, word: 'show up here', fix: 'Omit it, or name the action.' },
  { pattern: /\bclick here\b/i, word: 'click here', fix: 'Describe the destination.' },
  { pattern: /(^|\s)[·•](\s|$)|\s[·•]|[·•]\s/, word: '·', fix: 'Separate items with layout (§3b-16).' },
];

export const findBannedCopy = (text) => BANNED_COPY.find(({ pattern }) => pattern.test(text)) ?? null;

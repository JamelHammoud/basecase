export const CONTRACTIONS = {
  'is not': 'isn’t',
  'are not': 'aren’t',
  'was not': 'wasn’t',
  'were not': 'weren’t',
  'does not': 'doesn’t',
  'do not': 'don’t',
  'did not': 'didn’t',
  'has not': 'hasn’t',
  'have not': 'haven’t',
  'had not': 'hadn’t',
  'could not': 'couldn’t',
  'would not': 'wouldn’t',
  'should not': 'shouldn’t',
  'will not': 'won’t',
  cannot: 'can’t',
  'can not': 'can’t',
};

const LONG_FORM = new RegExp(`\\b(?:${Object.keys(CONTRACTIONS).join('|')})\\b`, 'gi');

export const contractionOf = (longForm) => {
  const short = CONTRACTIONS[longForm.toLowerCase()];

  return /^[A-Z]/.test(longForm) ? short[0].toUpperCase() + short.slice(1) : short;
};

export const findLongForms = (text) =>
  [...text.matchAll(LONG_FORM)].map(([word]) => ({ word, use: contractionOf(word) }));

export const CONTRACTION_COPY = [
  {
    pattern: new RegExp(LONG_FORM.source, 'i'),
    fix: 'Write the negative as a contraction: “isn’t”, “can’t”, “couldn’t”.',
    section: '§3b-22',
  },
];

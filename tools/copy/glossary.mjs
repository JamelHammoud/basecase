const MADE = [
  'animations?',
  'cameras?',
  'cases?',
  'chats?',
  'comments?',
  'marks?',
  'messages?',
  'models?',
  'polic(?:y|ies)',
  'poses?',
  'prices?',
  'printers?',
  'routines?',
  'scenes?',
  'skills?',
  'steps?',
  'suppl(?:y|ies)',
  'tr(?:y|ies)',
].join('|');

export const GLOSSARY = [
  {
    word: 'Delete',
    action: 'Destroy something a person made',
    synonyms: ['erased?', `(?:remove|clear) (?:${MADE})`, 'discard', 'trash', 'destroy'],
  },
  { word: 'Remove', action: 'Take something out of a list or a draft without destroying it', synonyms: ['detach'] },
  { word: 'Clear', action: 'Empty a field, a drawing in progress or a state', synonyms: ['wipe'] },
  {
    word: 'Stop',
    action: 'Halt something running',
    synonyms: ['end(?!$| effectors?\\b)', 'halt', 'abort', 'terminate', 'kill'],
  },
  { word: 'Open', action: 'Open a scene, file, image or page', synonyms: ['view(?!$)', 'see inside'] },
  { word: 'Close', action: 'Put away a tab, window, sheet or Case', synonyms: ['dismiss'] },
  {
    word: 'Show',
    action: 'Bring a panel, view, section or layer into sight (Hide puts it away)',
    synonyms: ['reveal', 'toggle', 'browse'],
  },
  { word: 'Duplicate', action: 'Make a second one beside the first', synonyms: ['clone'] },
  { word: 'Run', action: 'Start a Case, Routine, Checks or a policy', synonyms: ['launch', 'execute'] },
  { word: 'Add', action: 'Put a part in the scene', synonyms: ['insert (?:a )?parts?'] },
  { word: 'Insert', action: 'Put a model or robot in the scene', synonyms: ['add (?:a |an )?(?:models?|robots?)'] },
  {
    word: 'Make',
    action: 'Bring a new build guide, Case or Routine into being',
    synonyms: ['creat(?:e|es|ed|ing)', '(?:auto-)?generat(?:e|es|ed|ing)'],
  },
  { word: 'Update', action: 'Make an out-of-date build guide again', synonyms: ['regenerate'] },
];

export const GLOSSARY_COPY = GLOSSARY.flatMap(({ word, action, synonyms }) =>
  synonyms.map((source) => ({
    pattern: new RegExp(`^(?:${source})\\b`, 'i'),
    fix: `Say “${word}”: ${action[0].toLowerCase()}${action.slice(1)}.`,
    section: '§3b-17',
  })),
);

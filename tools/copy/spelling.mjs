export const SPELLING = {
  aluminium: 'aluminum',
  behaviour: 'behavior',
  behaviours: 'behaviors',
  cancelled: 'canceled',
  cancelling: 'canceling',
  catalogue: 'catalog',
  catalogues: 'catalogs',
  centre: 'center',
  centred: 'centered',
  centres: 'centers',
  centring: 'centering',
  colour: 'color',
  coloured: 'colored',
  colours: 'colors',
  grey: 'gray',
  greyed: 'grayed',
  greys: 'grays',
  labelled: 'labeled',
  labelling: 'labeling',
  metre: 'meter',
  metres: 'meters',
  millimetre: 'millimeter',
  millimetres: 'millimeters',
  modelled: 'modeled',
  modelling: 'modeling',
  neighbour: 'neighbor',
  neighbours: 'neighbors',
  optimisation: 'optimization',
  recognised: 'recognized',
  recognising: 'recognizing',
  travelled: 'traveled',
  travelling: 'traveling',
};

export const SPELLING_COPY = Object.entries(SPELLING).map(([british, american]) => ({
  pattern: new RegExp(`\\b${british}\\b`, 'i'),
  fix: `Spell it “${american}”: copy is in American English.`,
  section: '§3b-20',
}));

export function findBritish(text) {
  return Object.keys(SPELLING)
    .map((british) => new RegExp(`\\b${british}\\b`, 'i').exec(text))
    .filter(Boolean)
    .map((match) => ({ word: match[0], use: SPELLING[match[0].toLowerCase()] }));
}

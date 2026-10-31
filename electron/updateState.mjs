export const NO_UPDATE = Object.freeze({ stage: 'none', version: '' });

const MOVES = {
  found: (state, version) => (state.stage === 'none' ? { stage: 'getting', version } : state),
  ready: (state, version) =>
    state.stage === 'installing' ? state : { stage: 'ready', version: version || state.version },
  error: (state) => ({ getting: NO_UPDATE, installing: { ...state, stage: 'ready' } })[state.stage] ?? state,
  install: (state) => (state.stage === 'ready' ? { ...state, stage: 'installing' } : state),
};

export function nextUpdate(state, word, version = '') {
  return MOVES[word]?.(state, version) ?? state;
}

export function worthChecking(stage) {
  return stage === 'none' || stage === 'ready';
}

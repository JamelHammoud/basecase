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

export function channelOptions(beta) {
  return beta
    ? { channel: 'beta', allowPrerelease: true, allowDowngrade: false }
    : { channel: 'latest', allowPrerelease: false, allowDowngrade: false };
}

export const LATEST_DOWNLOAD = {
  darwin: { file: 'Basecase.dmg', step: 'move it to Applications' },
  win32: { file: 'Basecase-Setup.exe', step: 'run the installer' },
};

export function latestDownload(platform) {
  const latest = LATEST_DOWNLOAD[platform] ?? LATEST_DOWNLOAD.darwin;

  return { ...latest, url: `https://github.com/JamelHammoud/basecase/releases/latest/download/${latest.file}` };
}

export function worthChecking(stage) {
  return stage === 'none' || stage === 'ready';
}

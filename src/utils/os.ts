type Os = 'mac' | 'windows' | 'linux';

function detectOs(): Os {
  const platform = typeof window === 'undefined' ? undefined : window.electronAPI?.platform;
  const hint = platform ?? (typeof navigator === 'undefined' ? 'darwin' : navigator.platform);

  if (/^win/i.test(hint)) return 'windows';

  if (/linux/i.test(hint)) return 'linux';

  return 'mac';
}

export const OS: Os = detectOs();

export const IS_MAC = OS === 'mac';

export const IS_WINDOWS = OS === 'windows';

interface ModifierKeys {
  metaKey: boolean;
  ctrlKey: boolean;
}

export const hasPrimaryModifier = (e: ModifierKeys) => (IS_MAC ? e.metaKey : e.ctrlKey);

export const FILE_MANAGER = { mac: 'Finder', windows: 'Explorer', linux: 'Files' }[OS];

export const REVEAL_LABEL = `Show in ${FILE_MANAGER}`;

export const SHARE_LABEL = IS_MAC ? 'AirDrop' : 'USDZ Model';

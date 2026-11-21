export const SIMREADY_DATASETS = {
  objects: [
    'nvidia/simready-assets',
    'nvidia/simready-dsx',
    'ForgeCAD/simready-assets',
    'PalatialSim/palatial-nv-asset-library',
    'LGElectronics/simready-assets',
    'Vertiv/simready-assets',
  ],
  robots: [
    'onrobot/simready-grippers',
    'Robotiq-Official/simready-assets',
    'frankarobotics/simready-assets',
    'TeradyneRobotics/UniversalRobots',
    'FANUC-CORPORATION/SimReady-Assets',
    'Comau/N220-27',
    'Comau/S18-17',
    'standardbots/simready-core',
    'standardbots/simready-spark',
    'standardbots/simready-thor',
    'agibot-assets/simready-assets',
    'AGIBOT-Yuanzheng/A3_Ultra_usd',
    'Menlo/asimov-1-simready-usd',
  ],
};

const DATASETS = new Set(Object.values(SIMREADY_DATASETS).flat());
const SHA = /^[0-9a-f]{40}$/;
const SAFE_SEGMENT = /^[\w.@+-]+$/;

export function parseAssetUrl(url) {
  try {
    const u = new URL(url);
    const [kind, namespace, dataset, mode, sha, ...rest] = u.pathname.slice(1).split('/').map(decodeURIComponent);
    const valid =
      u.origin === 'https://huggingface.co' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      kind === 'datasets' &&
      DATASETS.has(`${namespace}/${dataset}`) &&
      (mode === 'blob' || mode === 'resolve') &&
      SHA.test(sha ?? '') &&
      rest.length >= 2 &&
      rest.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..');

    if (valid) return { namespace, dataset, sha, packageName: rest[0], rootPath: rest.join('/') };
  } catch {}

  throw new Error('That isn’t a SimReady asset link.');
}

export function catalogFilter(shelf) {
  const repos = shelf === 'all' ? [...DATASETS] : SIMREADY_DATASETS[shelf];

  return `.*/datasets/(${repos.join('|')})/.*`;
}

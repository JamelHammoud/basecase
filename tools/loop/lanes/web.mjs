import { isPaused } from '../lib/github.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 300,
  does: 'Recovers missed stable web deployments, retries failed jobs once and surfaces persistent failures to the doctor',
};

const deployments = store('web', { deployedRef: null, retried: [] });
const TITLE = 'Deploy web from ';

const deployRuns = () =>
  json('gh', ['api', 'repos/{owner}/{repo}/actions/workflows/deploy-web.yml/runs?per_page=50']).workflow_runs;

const stable = () => json('gh', ['api', 'repos/{owner}/{repo}/releases/latest']);

const commitOf = (ref) => json('gh', ['api', `repos/{owner}/{repo}/commits/${encodeURIComponent(ref)}`]).sha;

const includesRelease = (release, deployed) => {
  if (!deployed) return false;

  if (release === deployed) return true;

  const compared = json('gh', ['api', `repos/{owner}/{repo}/compare/${release}...${deployed}`]);

  return ['ahead', 'identical'].includes(compared.status);
};

function failed(deployment, state, log) {
  if (deployment.run_attempt > 1 || state.retried.includes(deployment.id))
    throw new Error(`Web deployment failed after recovery: ${deployment.html_url}`);

  run('gh', ['run', 'rerun', String(deployment.id), '--failed']);
  deployments.save('state', { ...state, retried: [...state.retried, deployment.id].slice(-50) });
  log(`retrying failed web jobs: ${deployment.html_url}`);
}

export default function web({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const release = stable();

  if (release.draft || release.prerelease) return log('no stable release to deploy');

  const ref = commitOf(release.tag_name);
  const state = deployments.get('state');

  if (includesRelease(ref, state.deployedRef)) return log(`web deployment includes ${release.tag_name}`);

  const runs = deployRuns();
  const deployment = runs.find((item) =>
    [ref, release.tag_name].some((target) => item.display_title === TITLE + target),
  );

  if (deployment?.status !== 'completed' && deployment) return log(`web deployment running for ${release.tag_name}`);

  if (deployment?.conclusion === 'success') {
    deployments.save('state', { ...state, deployedRef: ref });

    return log(`web deployment passed for ${release.tag_name}`);
  }

  if (deployment) return failed(deployment, state, log);

  if (runs.some((item) => item.status !== 'completed')) return log('another web deployment is running');

  run('gh', ['workflow', 'run', 'deploy-web.yml', '--ref', 'main', '-f', `ref=${ref}`]);
  log(`started missed web deployment for ${release.tag_name} at ${ref}`);
}

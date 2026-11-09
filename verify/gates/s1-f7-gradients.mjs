import { shCheck } from '../lib/gate.mjs';
import { FORGE_MANIFEST } from '../forge/run.mjs';

const test = (name, pkg, filter) =>
  shCheck(name, 'cargo', ['test', '--release', '--manifest-path', FORGE_MANIFEST, '-p', pkg, filter]);

export default {
  id: 's1-f7-gradients',
  stage: 1,
  title: 'F7: gradients, batched sysid, design sweeps',
  state: 'required',
  checks: [
    test(
      'gradient within 1% of finite differences off contact, 10% on smoothed contact',
      'forge-sim',
      'gradient_matches_fd',
    ),
    test('forward physics stays exact while gradients are smoothed', 'forge-sim', 'forward_stays_exact'),
    test('batched sysid recovers planted parameters to 3%', 'forge-id', 'batched_recovers_planted'),
    test('design sweep varies mass and gear per world', 'forge-sim', 'design_sweep'),
  ],
  canaries: [test('a planted wrong gradient is caught', 'forge-sim', 'canary_wrong_gradient_fails')],
};

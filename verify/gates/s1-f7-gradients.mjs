import { cargoCanary } from '../lib/canary.mjs';
import { shCheck } from '../lib/gate.mjs';
import { FORGE_MANIFEST } from '../forge/run.mjs';

const args = (pkg, filter) => ['test', '--release', '--manifest-path', FORGE_MANIFEST, '-p', pkg, filter];
const test = (name, pkg, filter) => shCheck(name, 'cargo', args(pkg, filter));

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
    test(
      'batched sysid recovers parameters planted from a fresh seed to 3%, on every world',
      'forge-id',
      'batched_recovers_planted',
    ),
    test('design sweep varies mass and gear per world', 'forge-sim', 'design_sweep'),
  ],
  canaries: [
    test('a planted wrong gradient is caught', 'forge-sim', 'canary_wrong_gradient_fails'),
    cargoCanary(
      'a sysid fit with one parameter off by more than 3% is caught',
      args('forge-id', 'canary_sysid_one_parameter_off_passes'),
      [/canary reached the planted fit/, /a fit is off by more than 3%/],
    ),
    cargoCanary('a sysid run with no worlds is caught', args('forge-id', 'canary_sysid_no_worlds_passes'), [
      /canary reached the empty fit/,
      /one fit per planted world/,
    ]),
  ],
};

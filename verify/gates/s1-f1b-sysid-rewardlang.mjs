import { shCheck } from '../lib/gate.mjs';
import { FORGE_MANIFEST } from '../forge/run.mjs';

const test = (name, pkg, filter) =>
  shCheck(name, 'cargo', ['test', '--release', '--manifest-path', FORGE_MANIFEST, '-p', pkg, filter]);

export default {
  id: 's1-f1b-sysid-rewardlang',
  stage: 1,
  title: 'F1b: forge-id recovers planted parameters; RewardLang interpreter',
  state: 'required',
  checks: [
    test('forge-id recovers planted servo parameters to 3%', 'forge-id', 'recovers_planted'),
    test('forge-id flags what it cannot identify', 'forge-id', 'flags_unidentified'),
    test('RewardLang matches hand-written reward terms', 'forge-reward', 'matches_handwritten'),
    test('RewardLang rejects loops, unknown names and impure code', 'forge-reward', 'rejects'),
    test('RewardLang kills NaN and blames the term', 'forge-reward', 'nan_blames_term'),
  ],
  canaries: [
    test('a no-op identifier is caught by the same check', 'forge-id', 'canary_noop_identifier_fails'),
    test('a wrong reward is caught by the same check', 'forge-reward', 'canary_wrong_term_fails'),
  ],
};

import { buildCase, builderRobot } from '../cases/caseBuilder';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes } from '../gallery/galleryBundle';
import { fixtureRobots, roundWheelRover } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import type { LeagueEntry, LeagueManifest } from './types';
import { hashBytes, hashValue, LEAGUE_RUNNER_VERSION } from './validation';

export function roverLeagueFixture() {
  const round = roundWheelRover();
  const four = structuredClone(fixtureRobots().find((robot) => robot.id === 'rover-four')!);
  const built = buildCase(
    { goal: 'reach', world: 'floor', values: { distanceMm: 600, seconds: 2 } },
    builderRobot(buildRig(round.joints, round.parts), round.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  built.kase.task.contract.failures = [
    {
      label: 'Outside the spot',
      formula: {
        always: {
          window: { last: 0.02 },
          state: { atom: { expr: { signal: 'spot' }, cmp: '>', value: 160, scale: 160 } },
        },
      },
    },
  ];

  const manifest: LeagueManifest = {
    formatVersion: 1,
    id: 'rover-sprint',
    title: 'Rover sprint',
    deadline: '2026-11-01T00:00:00.000Z',
    case: built.kase,
    caseHash: hashValue(built.kase),
    contractHash: hashValue(built.kase.task.contract),
    engine: { mujoco: '4.0.0', runner: LEAGUE_RUNNER_VERSION },
    ranking: { score: 'margin', direction: 'higher' },
    seedCount: 3,
  };
  const bundles = [round, four].map((robot) =>
    galleryBundleOf({
      slug: robot.id,
      title: robot.id === round.id ? 'Two-wheel rover' : 'Four-wheel rover',
      robotName: robot.id === round.id ? 'Two-wheel rover' : 'Four-wheel rover',
      parts: robot.parts,
      joints: robot.joints,
      kase: built.kase,
    }),
  );
  const entries: LeagueEntry[] = bundles.map((bundle) => ({
    id: bundle.slug,
    robotName: bundle.robot.name,
    repo: `basecase/${bundle.slug}`,
    revision: '0'.repeat(40),
    bundleHash: hashBytes(galleryBundleBytes(bundle)),
    enteredAt: '2026-10-31T00:00:00.000Z',
    budget: null,
  }));

  return { manifest, bundles, entries };
}

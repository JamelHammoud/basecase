import { presetCase, type PresetId } from '../cases/caseBuilder';
import { fixtureRobots, roundWheelRover } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { galleryBundleOf } from './buildBundle';
import type { GalleryBundle } from './galleryBundle';

const ENTRIES: Array<{ slug: string; robot: string; name: string; preset: PresetId }> = [
  { slug: 'arm-touch-the-dots', robot: 'arm-6dof', name: 'Six-joint arm', preset: 'touch-the-dots' },
  { slug: 'rover-reach-the-flag', robot: 'rover-diff-round', name: 'Two-wheel rover', preset: 'reach-the-flag' },
  { slug: 'hexapod-reach-the-flag', robot: 'hexapod', name: 'Hexapod', preset: 'reach-the-flag' },
];

export function galleryBundles(): GalleryBundle[] {
  const robots = [...fixtureRobots(), roundWheelRover()];

  return ENTRIES.map((e) => {
    const robot = robots.find((r) => r.id === e.robot)!;
    const kase = presetCase(e.preset, buildRig(robot.joints, robot.parts), robot.parts);

    return galleryBundleOf({
      slug: e.slug,
      title: `${kase.name}: ${e.name}`,
      robotName: e.name,
      parts: robot.parts,
      joints: robot.joints,
      kase,
    });
  });
}

export const galleryIndex = () => galleryBundles().map((b) => ({ slug: b.slug, title: b.title }));

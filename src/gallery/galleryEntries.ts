import { caseTemplates } from '../cases/templates';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { galleryBundleOf } from './buildBundle';
import type { GalleryBundle } from './galleryBundle';

const ENTRIES = [
  { slug: 'arm-touch-the-dots', robot: 'arm-6dof', name: 'Six-joint arm', template: 'touch-the-dots' },
  { slug: 'rover-reach-the-flag', robot: 'rover-diff', name: 'Two-wheel rover', template: 'reach-the-flag' },
  { slug: 'hexapod-reach-the-flag', robot: 'hexapod', name: 'Hexapod', template: 'reach-the-flag' },
];

export function galleryBundles(): GalleryBundle[] {
  const robots = fixtureRobots();

  return ENTRIES.map((e) => {
    const robot = robots.find((r) => r.id === e.robot)!;
    const kase = caseTemplates(buildRig(robot.joints, robot.parts), robot.parts)
      .find((t) => t.id === e.template)!
      .build();

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

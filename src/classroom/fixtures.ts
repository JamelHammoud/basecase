import { fixtureRobots } from '../sim/fixtures/robots';
import { presetCase } from '../cases/testing';
import { galleryBundleOf } from '../gallery/buildBundle';

export function classroomFixture() {
  const robot = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const bundle = galleryBundleOf({
    slug: 'class-rover',
    title: 'Reach a flag',
    robotName: 'Starter',
    ...robot,
    kase: presetCase(robot, 'reach-the-flag'),
  });

  return { robot, bundle };
}

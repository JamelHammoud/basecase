import { build } from './build.mjs';
import { newDesign, priors, simready } from './design.mjs';
import { electronics, fasteners, servos } from './mechanics.mjs';
import { joints, motion, simulation } from './motion.mjs';
import { photos } from './photos.mjs';
import { replicad } from './replicad.mjs';
import { shells } from './shells.mjs';

export const GUIDES = Object.fromEntries(
  [
    photos,
    shells,
    replicad,
    servos,
    fasteners,
    electronics,
    build,
    joints,
    motion,
    simulation,
    newDesign,
    priors,
    simready,
  ].map((g) => [g.name, g]),
);

export const GUIDE_INDEX = Object.values(GUIDES)
  .map((g) => `- ${g.name}: ${g.use}`)
  .join('\n');

export const guideText = (name) => {
  const guide = GUIDES[name];

  return guide ? `## Guide: ${guide.name}\n${guide.text.trim()}` : null;
};

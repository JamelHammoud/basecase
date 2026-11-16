import type { JointLoad } from './engineeringTypes';

export function worstJointLoad(loads: JointLoad[]): JointLoad | undefined {
  let worst: JointLoad | undefined;
  let highest = -Infinity;

  for (const load of loads) {
    const share = load.stallShare;

    if (share === undefined) continue;

    if (Number.isNaN(share))
      return loads.filter((item) => item.stallShare !== undefined).sort((a, b) => b.stallShare! - a.stallShare!)[0];

    if (!worst || share > highest) {
      worst = load;
      highest = share;
    }
  }

  return worst;
}

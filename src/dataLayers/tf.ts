import { tfTree, type FrameTransform, type TfTree } from '../three/viewport/dataFrames';
import type { TFMessage } from './messages';
import { asTrack, lastAtOrBefore, type DataTrack } from './track';

export function frameTransforms(message: TFMessage, at: number, fixed = false): FrameTransform[] {
  return message.transforms.map((t) => {
    const { translation: p, rotation: q } = t.transform;

    return {
      parent: t.header.frame_id.replace(/^\//, ''),
      child: t.child_frame_id.replace(/^\//, ''),
      stamp: at,
      pose: { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] },
      fixed,
    };
  });
}

export function treeAt(tracks: Iterable<DataTrack>, at: number | null): TfTree {
  const transforms: FrameTransform[] = [];

  for (const any of tracks) {
    if (any.schema !== 'tf2_msgs/TFMessage') continue;

    const track = asTrack<'tf2_msgs/TFMessage'>(any);
    const last = track.fixed || at === null ? track.times.length - 1 : lastAtOrBefore(track.times, at);

    for (let i = 0; i <= last; i++) transforms.push(...frameTransforms(track.message(i), track.times[i], track.fixed));
  }

  return tfTree(transforms);
}

export const treeFrames = (tree: TfTree): string[] => {
  const names = new Set<string>();

  for (const [child, edge] of tree.edges) names.add(child).add(edge.parent);

  return [...names];
};

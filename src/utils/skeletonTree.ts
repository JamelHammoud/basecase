import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';

export class SkeletonTree {
  readonly byId = new Map<string, SkeletonJoint>();
  private readonly children = new Map<string, SkeletonJoint[]>();

  constructor(skeleton: RobotSkeleton) {
    for (const joint of skeleton.joints) {
      this.byId.set(joint.id, joint);

      if (joint.parent === undefined) continue;

      const siblings = this.children.get(joint.parent);

      if (siblings) siblings.push(joint);
      else this.children.set(joint.parent, [joint]);
    }
  }

  childrenOf(id: string): readonly SkeletonJoint[] {
    return this.children.get(id) ?? [];
  }

  linkEnds(joint: SkeletonJoint): ZUpVec[] {
    return [...this.childrenOf(joint.id).map((child) => child.origin), ...(joint.tip ? [joint.tip] : [])];
  }

  linkLength(joint: SkeletonJoint): number {
    let length = 0;

    for (const end of this.linkEnds(joint))
      length = Math.max(length, Math.hypot(...end.map((value, i) => value - joint.origin[i])));

    return length;
  }

  subtreeOf(id: string): string[] {
    const out = [id];
    const seen = new Set(out);

    for (let i = 0; i < out.length; i++) {
      for (const child of this.childrenOf(out[i])) {
        if (seen.has(child.id)) continue;

        seen.add(child.id);
        out.push(child.id);
      }
    }

    return out;
  }
}

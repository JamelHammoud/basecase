export const POSE_EPSILON = 1e-5;

export class PoseGate {
  private shown: Float64Array | null = null;

  moved(poses: Float64Array): boolean {
    const shown = this.shown;

    if (shown?.length === poses.length && poses.every((value, i) => Math.abs(value - shown[i]) <= POSE_EPSILON)) {
      return false;
    }

    this.shown = poses.slice();

    return true;
  }

  reset(): void {
    this.shown = null;
  }
}

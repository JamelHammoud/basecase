import type { MjData } from '@mujoco/mujoco';

export interface PushTiming {
  seconds?: number;
  releaseDeg?: number;
}

interface Push {
  body: number;
  force: [number, number, number];
  until: number;
  release?: { tilt: () => number; deg: number };
}

export class PushForce {
  private push: Push | null = null;
  private readonly data: MjData;

  constructor(data: MjData) {
    this.data = data;
  }

  start(body: number, sceneForce: [number, number, number], timing: PushTiming & { tilt: () => number }) {
    const { seconds = 0.15, releaseDeg, tilt } = timing;

    this.push = {
      body,
      force: [sceneForce[0], -sceneForce[2], sceneForce[1]],
      until: this.data.time + seconds,
      ...(releaseDeg === undefined ? {} : { release: { tilt, deg: releaseDeg } }),
    };
  }

  forget() {
    this.push = null;
  }

  apply() {
    if (!this.push) return;

    const xf = this.data.xfrc_applied;
    const b = this.push.body * 6;
    const { release } = this.push;
    const leaning = !release || release.tilt() < release.deg;

    if (this.data.time < this.push.until && leaning) [xf[b], xf[b + 1], xf[b + 2]] = this.push.force;
    else {
      xf[b] = xf[b + 1] = xf[b + 2] = 0;
      this.push = null;
    }
  }
}

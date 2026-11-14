import { AgentFrames } from './agentFrames';
import { CameraGlyphs } from './cameraGlyphs';
import { CheckDots } from './checkDots';
import type { ViewportContext } from './viewportContext';
import { GhostLayer } from './ghostLayer';
import { MatTrack } from './matTrack';
import { ScanPoints } from './scanPoints';
import type { Viewport3DHandle, ViewportProps } from './types';

type OverlayHandle = Pick<
  Viewport3DHandle,
  'setScan' | 'scanPointCount' | 'setMatTrack' | 'setGhost' | 'ghostState' | 'checkDotCount'
>;

export class StageOverlays {
  readonly ghost: GhostLayer;

  readonly agentFrames: AgentFrames;

  private readonly cameraGlyphs: CameraGlyphs;

  private readonly scanPoints: ScanPoints;

  private readonly matTrack: MatTrack;

  private readonly checkDots: CheckDots;

  constructor(ctx: ViewportContext, props: ViewportProps, ghostLabel: () => HTMLElement | null) {
    const { overlays } = ctx.stage;

    this.cameraGlyphs = new CameraGlyphs(overlays);
    this.cameraGlyphs.sync(props.fixedCameras);
    this.scanPoints = new ScanPoints(overlays);
    this.matTrack = new MatTrack(overlays);
    this.checkDots = new CheckDots(overlays);
    this.checkDots.sync(props.checkDots);
    this.ghost = new GhostLayer(ctx, ghostLabel);
    this.agentFrames = new AgentFrames(ctx);
    this.agentFrames.sync(props.agentFrames ?? []);
  }

  sync(previous: ViewportProps, props: ViewportProps): void {
    if (previous.agentFrames !== props.agentFrames) this.agentFrames.sync(props.agentFrames ?? []);

    if (previous.fixedCameras !== props.fixedCameras) this.cameraGlyphs.sync(props.fixedCameras);

    if (previous.checkDots !== props.checkDots) this.checkDots.sync(props.checkDots);
  }

  handle(redraw: () => void): OverlayHandle {
    return {
      setScan: (points) => {
        if (this.scanPoints.set(points)) redraw();
      },
      scanPointCount: () => this.scanPoints.size,
      setMatTrack: (track) => {
        if (this.matTrack.set(track)) redraw();
      },
      setGhost: (ghost) => this.ghost.set(ghost),
      ghostState: () => this.ghost.state(),
      checkDotCount: () => this.checkDots.count,
    };
  }

  dispose(): void {
    this.cameraGlyphs.dispose();
    this.scanPoints.dispose();
    this.matTrack.dispose();
    this.checkDots.dispose();
    this.ghost.dispose();
    this.agentFrames.dispose();
  }
}

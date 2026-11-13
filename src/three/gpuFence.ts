export class GpuFence {
  private readonly gl: WebGL2RenderingContext;

  private readonly depth: number;

  private readonly syncs: WebGLSync[] = [];

  constructor(gl: WebGL2RenderingContext, depth = 3) {
    this.gl = gl;
    this.depth = depth;
  }

  mark(): void {
    const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    if (sync) this.syncs.push(sync);

    this.gl.flush();
  }

  full(): boolean {
    while (this.syncs.length && this.done(this.syncs[0])) this.gl.deleteSync(this.syncs.shift()!);

    return this.syncs.length >= this.depth;
  }

  private done(sync: WebGLSync): boolean {
    return this.gl.clientWaitSync(sync, 0, 0) !== this.gl.TIMEOUT_EXPIRED;
  }
}

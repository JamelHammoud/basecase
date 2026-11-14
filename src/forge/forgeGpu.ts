import {
  COMPUTE_STAGE,
  MAP_READ,
  USAGE,
  webGpu,
  type BindingType,
  type Buffer,
  type Device,
  type Opaque,
} from './gpuTypes';

const ENTRIES = ['step_worlds', 'forward_worlds', 'profile_worlds', 'qualify'];
const BLOCK = 16;
const STORAGE = USAGE.storage | USAGE.copyDst | USAGE.copySrc;
const KINDS: BindingType[] = [
  'storage',
  'storage',
  'storage',
  'read-only-storage',
  'storage',
  'read-only-storage',
  'read-only-storage',
  'uniform',
];

export interface Program {
  source: string;
  reals: Float32Array;
  ints: Int32Array;
  nstate: number;
  nreals: number;
  nints: number;
  worlds: number;
}

export interface RunCall {
  entry: number;
  groups: number;
  params: Uint32Array;
  io: Float32Array;
  order: Uint32Array;
  stats: Int32Array;
}

interface Batch {
  pipelines: Opaque[];
  layout: Opaque;
  fixed: Buffer[];
  bind: Opaque | null;
  io: Buffer | null;
  order: Buffer | null;
  stats: Buffer | null;
  readIo: Buffer | null;
  readStats: Buffer | null;
}

const padded = (bytes: number) => Math.max(16, Math.ceil(bytes / 4) * 4);

export class ForgeGpu {
  private batches = new Map<number, Batch>();
  private next = 1;
  private device: Device;
  readonly workgroupBytes: number;
  readonly name: string;

  private constructor(device: Device, workgroupBytes: number, name: string) {
    this.device = device;
    this.workgroupBytes = workgroupBytes;
    this.name = name;
  }

  static async open(): Promise<ForgeGpu> {
    const adapter = await webGpu()?.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) throw new Error('This browser has no WebGPU adapter.');

    const limits = adapter.limits;
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
        maxBufferSize: limits.maxBufferSize,
        maxComputeWorkgroupStorageSize: limits.maxComputeWorkgroupStorageSize,
        maxStorageBuffersPerShaderStage: Math.min(8, limits.maxStorageBuffersPerShaderStage),
      },
    });
    const info = adapter.info;

    return new ForgeGpu(device, limits.maxComputeWorkgroupStorageSize, `${info.vendor} ${info.architecture}`.trim());
  }

  open() {
    return this.next++;
  }

  private buffer(bytes: number, usage = STORAGE) {
    return this.device.createBuffer({ size: padded(bytes), usage });
  }

  async load(id: number, program: Program) {
    const worlds = Math.ceil(program.worlds / BLOCK) * BLOCK;
    const module = this.device.createShaderModule({ code: program.source });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');

    if (errors.length) throw new Error(`WebGPU couldn’t compile Forge’s kernels: ${errors[0].message}`);

    const layout = this.device.createBindGroupLayout({
      entries: KINDS.map((type, binding) => ({ binding, visibility: COMPUTE_STAGE, buffer: { type } })),
    });
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelines = await Promise.all(
      ENTRIES.map((entryPoint) =>
        this.device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } }),
      ),
    );
    const reals = this.buffer(program.reals.byteLength);
    const ints = this.buffer(program.ints.byteLength);

    this.device.queue.writeBuffer(reals, 0, program.reals);
    this.device.queue.writeBuffer(ints, 0, program.ints);
    this.batches.set(id, {
      pipelines,
      layout,
      fixed: [
        this.buffer(8 * program.nreals * worlds),
        this.buffer(4 * program.nints * worlds),
        reals,
        ints,
        this.buffer(16, USAGE.uniform | USAGE.copyDst),
      ],
      bind: null,
      io: null,
      order: null,
      stats: null,
      readIo: null,
      readStats: null,
    });
  }

  private ensure(batch: Batch, call: RunCall) {
    if (batch.bind) return;

    const read = USAGE.mapRead | USAGE.copyDst;
    const [scratch, ints, reals, tables, params] = batch.fixed;

    batch.io = this.buffer(call.io.byteLength);
    batch.order = this.buffer(call.order.byteLength);
    batch.stats = this.buffer(call.stats.byteLength);
    batch.readIo = this.buffer(call.io.byteLength, read);
    batch.readStats = this.buffer(call.stats.byteLength, read);

    const buffers = [batch.io, scratch, ints, batch.order, batch.stats, reals, tables, params];

    batch.bind = this.device.createBindGroup({
      layout: batch.layout,
      entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  }

  async run(id: number, call: RunCall) {
    const batch = this.batches.get(id);

    if (!batch) throw new Error('Forge ran a batch it never loaded.');

    this.ensure(batch, call);

    const queue = this.device.queue;
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    queue.writeBuffer(batch.io!, 0, call.io);
    queue.writeBuffer(batch.order!, 0, call.order);
    queue.writeBuffer(batch.fixed[4], 0, call.params);
    pass.setPipeline(batch.pipelines[call.entry]);
    pass.setBindGroup(0, batch.bind!);
    pass.dispatchWorkgroups(Math.max(1, call.groups));
    pass.end();
    encoder.copyBufferToBuffer(batch.io!, batch.readIo!, call.io.byteLength);
    encoder.copyBufferToBuffer(batch.stats!, batch.readStats!, call.stats.byteLength);
    queue.submit([encoder.finish()]);
    await Promise.all([batch.readIo!.mapAsync(MAP_READ), batch.readStats!.mapAsync(MAP_READ)]);

    const io = new Float32Array(batch.readIo!.getMappedRange(0, call.io.byteLength)).slice();
    const stats = new Int32Array(batch.readStats!.getMappedRange(0, call.stats.byteLength)).slice();

    batch.readIo!.unmap();
    batch.readStats!.unmap();

    return { io, stats };
  }

  destroy() {
    this.device.destroy();
  }
}

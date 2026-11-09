export const USAGE = { mapRead: 0x1, copySrc: 0x4, copyDst: 0x8, uniform: 0x40, storage: 0x80 };
export const COMPUTE_STAGE = 0x4;
export const MAP_READ = 0x1;

export type BindingType = 'storage' | 'read-only-storage' | 'uniform';

export interface Buffer {
  mapAsync: (mode: number) => Promise<void>;
  getMappedRange: (offset: number, size: number) => ArrayBuffer;
  unmap: () => void;
}

export interface Opaque {
  readonly kind?: never;
}

export interface Pass {
  setPipeline: (pipeline: Opaque) => void;
  setBindGroup: (index: number, group: Opaque) => void;
  dispatchWorkgroups: (x: number) => void;
  end: () => void;
}

export interface Encoder {
  beginComputePass: () => Pass;
  copyBufferToBuffer: (src: Buffer, dst: Buffer, size: number) => void;
  finish: () => Opaque;
}

export interface ShaderModule {
  getCompilationInfo: () => Promise<{ messages: Array<{ type: string; message: string }> }>;
}

export interface Device {
  queue: {
    writeBuffer: (buffer: Buffer, offset: number, data: ArrayBufferView) => void;
    submit: (buffers: Opaque[]) => void;
  };
  createBuffer: (desc: { size: number; usage: number }) => Buffer;
  createShaderModule: (desc: { code: string }) => ShaderModule;
  createBindGroupLayout: (desc: {
    entries: Array<{ binding: number; visibility: number; buffer: { type: BindingType } }>;
  }) => Opaque;
  createPipelineLayout: (desc: { bindGroupLayouts: Opaque[] }) => Opaque;
  createComputePipelineAsync: (desc: {
    layout: Opaque;
    compute: { module: ShaderModule; entryPoint: string };
  }) => Promise<Opaque>;
  createBindGroup: (desc: {
    layout: Opaque;
    entries: Array<{ binding: number; resource: { buffer: Buffer } }>;
  }) => Opaque;
  createCommandEncoder: () => Encoder;
  destroy: () => void;
}

export interface Limits {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupStorageSize: number;
  maxStorageBuffersPerShaderStage: number;
}

export interface Adapter {
  limits: Limits;
  info: { vendor: string; architecture: string };
  requestDevice: (desc: { requiredLimits: Partial<Limits> }) => Promise<Device>;
}

export interface Gpu {
  requestAdapter: (options: { powerPreference: 'high-performance' }) => Promise<Adapter | null>;
}

export const webGpu = () => (navigator as unknown as { gpu?: Gpu }).gpu;

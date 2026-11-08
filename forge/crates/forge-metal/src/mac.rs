use crate::{Arg, BufferId, Dispatch, Plain, Timing};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_foundation::NSString;
use objc2_metal::{
    MTLBuffer, MTLCommandBuffer, MTLCommandBufferStatus, MTLCommandEncoder, MTLCommandQueue, MTLCompileOptions,
    MTLComputeCommandEncoder, MTLComputePipelineState, MTLCreateSystemDefaultDevice, MTLDevice, MTLLibrary,
    MTLMathMode, MTLResourceOptions, MTLSize,
};
use std::marker::PhantomData;
use std::ptr::NonNull;

type Device = Retained<ProtocolObject<dyn MTLDevice>>;
type Queue = Retained<ProtocolObject<dyn MTLCommandQueue>>;
type RawBuffer = Retained<ProtocolObject<dyn MTLBuffer>>;
type Pipeline = Retained<ProtocolObject<dyn MTLComputePipelineState>>;

pub struct Kernel {
    pipeline: Pipeline,
}

unsafe impl Send for Kernel {}

impl Kernel {
    pub fn max_group(&self) -> usize {
        self.pipeline.maxTotalThreadsPerThreadgroup()
    }

    pub fn simd_width(&self) -> usize {
        self.pipeline.threadExecutionWidth()
    }
}

struct Slot {
    raw: RawBuffer,
    bytes: usize,
}

pub struct Gpu {
    device: Device,
    queue: Queue,
    slots: Vec<Slot>,
}

unsafe impl Send for Gpu {}

impl Gpu {
    pub fn new() -> Result<Self, String> {
        let device = MTLCreateSystemDefaultDevice().ok_or("This Mac has no Metal device")?;
        let queue = device.newCommandQueue().ok_or("Metal couldn't make a command queue")?;

        Ok(Self {
            device,
            queue,
            slots: Vec::new(),
        })
    }

    pub fn name(&self) -> String {
        self.device.name().to_string()
    }

    pub fn compile(&self, source: &str, names: &[&str]) -> Result<Vec<Kernel>, String> {
        let options = MTLCompileOptions::new();

        options.setMathMode(MTLMathMode::Safe);

        let library = self
            .device
            .newLibraryWithSource_options_error(&NSString::from_str(source), Some(&options))
            .map_err(|e| format!("Metal couldn't compile Forge's kernels: {}", e.localizedDescription()))?;

        names
            .iter()
            .map(|name| {
                let function = library
                    .newFunctionWithName(&NSString::from_str(name))
                    .ok_or_else(|| format!("Forge's Metal library has no kernel {name}"))?;
                let pipeline = self
                    .device
                    .newComputePipelineStateWithFunction_error(&function)
                    .map_err(|e| format!("Metal couldn't build kernel {name}: {}", e.localizedDescription()))?;

                Ok(Kernel { pipeline })
            })
            .collect()
    }

    pub fn alloc<T: Plain>(&mut self, len: usize) -> Result<BufferId<T>, String> {
        let bytes = len.max(1) * std::mem::size_of::<T>();
        let raw = self
            .device
            .newBufferWithLength_options(bytes, MTLResourceOptions::StorageModeShared)
            .ok_or_else(|| format!("Metal couldn't allocate {bytes} bytes"))?;

        unsafe { std::ptr::write_bytes(raw.contents().cast::<u8>().as_ptr(), 0, bytes) };
        self.slots.push(Slot { raw, bytes });

        Ok(BufferId {
            index: self.slots.len() - 1,
            len,
            kind: PhantomData,
        })
    }

    pub fn slice<T: Plain>(&self, id: BufferId<T>) -> &[T] {
        let slot = &self.slots[id.index];

        assert!(id.len * std::mem::size_of::<T>() <= slot.bytes);

        let ptr = slot.raw.contents().cast::<T>();

        unsafe { std::slice::from_raw_parts(ptr.as_ptr(), id.len) }
    }

    pub fn slice_mut<T: Plain>(&mut self, id: BufferId<T>) -> &mut [T] {
        let slot = &self.slots[id.index];

        assert!(id.len * std::mem::size_of::<T>() <= slot.bytes);

        let ptr = slot.raw.contents().cast::<T>();

        unsafe { std::slice::from_raw_parts_mut(ptr.as_ptr(), id.len) }
    }

    pub fn run(&mut self, dispatches: &[Dispatch]) -> Result<Timing, String> {
        let command = self
            .queue
            .commandBuffer()
            .ok_or("Metal couldn't make a command buffer")?;
        let encoder = command
            .computeCommandEncoder()
            .ok_or("Metal couldn't make a compute encoder")?;

        for d in dispatches {
            self.encode(&encoder, d)?;
        }

        encoder.endEncoding();
        command.commit();
        command.waitUntilCompleted();

        if command.status() != MTLCommandBufferStatus::Completed {
            let why = command.error().map_or_else(
                || "no reason given".to_owned(),
                |e| e.localizedDescription().to_string(),
            );

            return Err(format!("Forge's Metal step failed: {why}"));
        }

        Ok(Timing {
            gpu_seconds: command.GPUEndTime() - command.GPUStartTime(),
        })
    }

    fn encode(&self, encoder: &ProtocolObject<dyn MTLComputeCommandEncoder>, d: &Dispatch) -> Result<(), String> {
        encoder.setComputePipelineState(&d.kernel.pipeline);

        for (index, arg) in d.args.iter().enumerate() {
            match arg {
                Arg::Buffer(slot) => {
                    let raw = &self.slots.get(*slot).ok_or("Unknown Metal buffer")?.raw;

                    unsafe { encoder.setBuffer_offset_atIndex(Some(raw), 0, index) };
                }
                Arg::Words(words) => {
                    let bytes = std::mem::size_of_val(*words).max(4);
                    let ptr = NonNull::new(words.as_ptr().cast_mut().cast()).ok_or("Empty Metal argument")?;

                    unsafe { encoder.setBytes_length_atIndex(ptr, bytes, index) };
                }
            }
        }

        let group = d.group.clamp(1, d.kernel.max_group());

        encoder.dispatchThreads_threadsPerThreadgroup(
            MTLSize {
                width: d.threads.max(1),
                height: 1,
                depth: 1,
            },
            MTLSize {
                width: group,
                height: 1,
                depth: 1,
            },
        );

        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access {
    ReadWrite,
    ReadOnly,
    Uniform,
}

pub struct Slot {
    pub buffer: wgpu::Buffer,
    pub staging: Option<wgpu::Buffer>,
    pub bytes: u64,
}

pub struct Gpu {
    pub(crate) device: wgpu::Device,
    pub(crate) queue: wgpu::Queue,
    pub(crate) slots: Vec<Slot>,
    name: String,
    limits: wgpu::Limits,
}

pub struct Program {
    pub(crate) pipelines: Vec<wgpu::ComputePipeline>,
    pub(crate) layout: wgpu::BindGroupLayout,
    pub(crate) bind: Option<wgpu::BindGroup>,
}

fn entry(binding: u32, access: Access) -> wgpu::BindGroupLayoutEntry {
    let ty = match access {
        Access::Uniform => wgpu::BufferBindingType::Uniform,
        Access::ReadOnly => wgpu::BufferBindingType::Storage { read_only: true },
        Access::ReadWrite => wgpu::BufferBindingType::Storage { read_only: false },
    };

    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn wanted_limits(adapter: &wgpu::Adapter) -> wgpu::Limits {
    let best = adapter.limits();

    wgpu::Limits {
        max_storage_buffer_binding_size: best.max_storage_buffer_binding_size,
        max_buffer_size: best.max_buffer_size,
        max_compute_workgroup_storage_size: best.max_compute_workgroup_storage_size,
        max_storage_buffers_per_shader_stage: best.max_storage_buffers_per_shader_stage.min(8),
        ..wgpu::Limits::default()
    }
}

impl Gpu {
    pub fn new() -> Result<Self, String> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let options = wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..wgpu::RequestAdapterOptions::default()
        };
        let adapter = pollster::block_on(instance.request_adapter(&options))
            .map_err(|e| format!("No GPU adapter for Forge's WGSL engine: {e}"))?;
        let limits = wanted_limits(&adapter);
        let descriptor = wgpu::DeviceDescriptor {
            label: Some("forge"),
            required_limits: limits.clone(),
            ..wgpu::DeviceDescriptor::default()
        };
        let (device, queue) = pollster::block_on(adapter.request_device(&descriptor))
            .map_err(|e| format!("The GPU refused Forge's device: {e}"))?;
        let info = adapter.get_info();

        Ok(Self {
            device,
            queue,
            slots: Vec::new(),
            name: format!("{} via {:?}", info.name, info.backend),
            limits,
        })
    }

    pub fn name(&self) -> String {
        self.name.clone()
    }

    pub fn workgroup_bytes(&self) -> usize {
        self.limits.max_compute_workgroup_storage_size as usize
    }

    pub fn max_binding(&self) -> u64 {
        self.limits
            .max_storage_buffer_binding_size
            .min(self.limits.max_buffer_size)
    }

    pub fn compile(&self, source: &str, entries: &[&str], bindings: &[Access]) -> Result<Program, String> {
        let scope = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let module = self.device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("forge"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
        let entries_layout: Vec<_> = (0u32..).zip(bindings).map(|(b, a)| entry(b, *a)).collect();
        let layout = self.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("forge"),
            entries: &entries_layout,
        });
        let pipeline_layout = self.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("forge"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipelines = entries
            .iter()
            .map(|name| {
                self.device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                    label: Some(name),
                    layout: Some(&pipeline_layout),
                    module: &module,
                    entry_point: Some(name),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    cache: None,
                })
            })
            .collect();

        if let Some(error) = pollster::block_on(scope.pop()) {
            return Err(format!("wgpu couldn't compile Forge's kernels: {error}"));
        }

        Ok(Program {
            pipelines,
            layout,
            bind: None,
        })
    }

    pub fn buffer(&mut self, access: Access, bytes: u64) -> Result<usize, String> {
        let bytes = bytes.max(16).next_multiple_of(4);

        if access != Access::Uniform && bytes > self.max_binding() {
            return Err(format!(
                "Forge's WGSL engine needs a {bytes}-byte buffer and this GPU binds at most {}",
                self.max_binding()
            ));
        }

        let usage = match access {
            Access::Uniform => wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            _ => wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
        };
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("forge"),
            size: bytes,
            usage,
            mapped_at_creation: false,
        });

        self.slots.push(Slot {
            buffer,
            staging: None,
            bytes,
        });

        Ok(self.slots.len() - 1)
    }

    pub fn bind(&self, program: &mut Program, buffers: &[usize]) {
        let entries: Vec<_> = (0u32..)
            .zip(buffers)
            .map(|(binding, &slot)| wgpu::BindGroupEntry {
                binding,
                resource: self.slots[slot].buffer.as_entire_binding(),
            })
            .collect();

        program.bind = Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("forge"),
            layout: &program.layout,
            entries: &entries,
        }));
    }
}

use crate::device::{Gpu, Program};
use crate::Timing;
use std::sync::mpsc;
use std::time::Instant;

pub enum Target<'a> {
    F32(usize, &'a mut [f32]),
    I32(usize, &'a mut [i32]),
}

impl Target<'_> {
    fn slot(&self) -> usize {
        match self {
            Target::F32(slot, _) | Target::I32(slot, _) => *slot,
        }
    }

    fn bytes(&self) -> u64 {
        match self {
            Target::F32(_, v) => (v.len() * 4) as u64,
            Target::I32(_, v) => (v.len() * 4) as u64,
        }
    }

    fn fill(&mut self, raw: &[u8]) {
        match self {
            Target::F32(_, v) => v.copy_from_slice(bytemuck::cast_slice(raw)),
            Target::I32(_, v) => v.copy_from_slice(bytemuck::cast_slice(raw)),
        }
    }
}

impl Gpu {
    pub fn write_f32(&self, slot: usize, data: &[f32]) {
        self.queue
            .write_buffer(&self.slots[slot].buffer, 0, bytemuck::cast_slice(data));
    }

    pub fn write_u32(&self, slot: usize, data: &[u32]) {
        self.queue
            .write_buffer(&self.slots[slot].buffer, 0, bytemuck::cast_slice(data));
    }

    fn staging(&mut self, slot: usize) -> wgpu::Buffer {
        let bytes = self.slots[slot].bytes;
        let device = &self.device;

        self.slots[slot]
            .staging
            .get_or_insert_with(|| {
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("forge-read"),
                    size: bytes,
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                })
            })
            .clone()
    }

    pub fn run(
        &mut self,
        program: &Program,
        entry: usize,
        groups: u32,
        reads: &mut [Target],
    ) -> Result<Timing, String> {
        let bind = program.bind.as_ref().ok_or("Forge's kernels have no buffers bound")?;
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());

            pass.set_pipeline(&program.pipelines[entry]);
            pass.set_bind_group(0, bind, &[]);
            pass.dispatch_workgroups(groups.max(1), 1, 1);
        }

        self.finish(encoder, reads)
    }

    pub fn read(&mut self, reads: &mut [Target]) -> Result<Timing, String> {
        let encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());

        self.finish(encoder, reads)
    }

    fn finish(&mut self, mut encoder: wgpu::CommandEncoder, reads: &mut [Target]) -> Result<Timing, String> {
        let tick = Instant::now();

        let stagings: Vec<wgpu::Buffer> = reads.iter().map(|r| self.staging(r.slot())).collect();

        for (r, staging) in reads.iter().zip(&stagings) {
            encoder.copy_buffer_to_buffer(&self.slots[r.slot()].buffer, 0, staging, 0, r.bytes());
        }

        self.queue.submit([encoder.finish()]);
        self.read_back(reads, &stagings)?;

        Ok(Timing {
            seconds: tick.elapsed().as_secs_f64(),
        })
    }

    fn read_back(&self, reads: &mut [Target], stagings: &[wgpu::Buffer]) -> Result<(), String> {
        let (sender, receiver) = mpsc::channel();

        for (r, staging) in reads.iter().zip(stagings) {
            let sender = sender.clone();

            staging
                .slice(..r.bytes())
                .map_async(wgpu::MapMode::Read, move |result| {
                    let _ = sender.send(result.is_ok());
                });
        }

        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|e| format!("Forge's WGSL step failed: {e}"))?;

        if !receiver.try_iter().take(reads.len()).all(|ok| ok) {
            return Err("Forge couldn't read the GPU's results back".to_owned());
        }

        for (r, staging) in reads.iter_mut().zip(stagings) {
            let view = staging
                .slice(..r.bytes())
                .get_mapped_range()
                .map_err(|e| format!("Forge couldn't read the GPU's results back: {e}"))?;

            r.fill(&view);
            drop(view);
            staging.unmap();
        }

        Ok(())
    }
}

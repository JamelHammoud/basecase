use crate::host::{self, Run, Tables};
use forge_sim::wgsl::{Backend, Call, Program};

pub struct HostBackend {
    batch: i32,
}

pub fn launch() -> Result<Box<dyn Backend>, String> {
    Ok(Box::new(HostBackend { batch: host::open() }))
}

impl Backend for HostBackend {
    fn device(&self) -> String {
        "WebGPU".to_owned()
    }

    fn workgroup_bytes(&self) -> usize {
        host::workgroup_bytes()
    }

    fn load(&mut self, program: &Program, worlds: usize) -> Result<(), String> {
        let tables = Tables {
            reals: &program.reals,
            ints: &program.ints,
            sizes: [program.nstate, program.nreals, program.nints, worlds],
        };

        host::load(self.batch, &program.source, &tables)
    }

    fn run(&mut self, call: Call<'_>) -> Result<f64, String> {
        let started = host::now();
        let run = Run {
            entry: call.entry as u32,
            groups: call.groups,
            params: call.params,
            io: call.io,
            order: call.order,
            stats: call.stats,
        };

        host::run(self.batch, run)?;

        Ok(host::now() - started)
    }

    fn scratch(&mut self) -> Result<Vec<f32>, String> {
        Err("Forge's WGSL engine in a tab doesn't read its scratch back".to_owned())
    }
}

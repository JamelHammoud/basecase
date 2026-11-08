mod actuators;
mod bodies;
mod kernel;
mod meshes;
mod names;
mod pairs;
mod read;
mod refuse;

pub use kernel::*;
pub use refuse::Refusal;

use forge_mujoco::Model;
use names::Names;
use pairs::PairInput;
use read::Reader;
use std::path::Path;

const DISABLE_WARMSTART: u32 = 1 << 9;
const DISABLE_FILTERPARENT: u32 = 1 << 10;
const DISABLE_REFSAFE: u32 = 1 << 12;
const DISABLE_CLAMPCTRL: u32 = 1 << 8;

fn options(r: &Reader) -> Result<Options, String> {
    let gravity = r.option("gravity")?;
    let disable = r.flag("disableflags")? as u32;

    Ok(Options {
        timestep: r.scalar("timestep")?,
        gravity: [gravity[0], gravity[1], gravity[2]],
        impratio: r.scalar("impratio")?,
        tolerance: r.scalar("tolerance")?,
        ls_tolerance: r.scalar("ls_tolerance")?,
        iterations: r.flag("iterations")?.max(0) as usize,
        ls_iterations: r.flag("ls_iterations")?.max(0) as usize,
        warmstart: disable & DISABLE_WARMSTART == 0,
        refsafe: disable & DISABLE_REFSAFE == 0,
        clamp_ctrl: disable & DISABLE_CLAMPCTRL == 0,
    })
}

fn build(r: &Reader, reasons: &mut Vec<String>) -> Result<Kernel, String> {
    let names = Names::new(r);

    refuse::options(r, reasons)?;
    refuse::counts(r, reasons)?;

    let bodies = bodies::bodies(r)?;
    let joints = bodies::joints(r, &names, reasons)?;
    let dofs = bodies::dofs(r, &names, reasons)?;

    bodies::standalone_free_bodies(r, &names, &joints, reasons);

    let geoms = pairs::geoms(r, &names, reasons)?;
    let input = PairInput {
        bodies: &bodies,
        filter_parent: r.flag("disableflags")? as u32 & DISABLE_FILTERPARENT == 0,
    };
    let pairs = pairs::pairs(r, &names, &input, reasons)?;
    let actuators = actuators::actuators(r, &names, &joints, reasons)?;

    Ok(Kernel {
        options: options(r)?,
        nq: r.size("nq")?,
        nv: r.size("nv")?,
        nu: r.size("nu")?,
        qpos0: r.f64s("qpos0")?.to_vec(),
        bodies,
        joints,
        dofs,
        geoms,
        meshes: meshes::meshes(r)?,
        pairs,
        actuators,
    })
}

pub fn lower(model: &Model) -> Result<Kernel, Refusal> {
    let reader = Reader::new(model);
    let mut reasons = Vec::new();
    let kernel = build(&reader, &mut reasons).map_err(Refusal::one)?;

    if reasons.is_empty() {
        Ok(kernel)
    } else {
        Err(Refusal { reasons })
    }
}

pub fn load(path: &Path) -> Result<(Model, Kernel), Refusal> {
    let model = Model::load(path).map_err(Refusal::one)?;
    let kernel = lower(&model)?;

    Ok((model, kernel))
}

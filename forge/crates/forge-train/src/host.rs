use crate::job::Job;
use crate::physics::Engine;
use crate::robot::{Assembly, Joints, Robot, Settled};
use forge_ir::{Fields, Kernel, Source};
use forge_sim::rowmap::RowMap;
use forge_sim::wgsl::Backend;

pub type Launch = fn() -> Result<Box<dyn Backend>, String>;

pub struct HostModel {
    pub fields: Fields,
    pub kernel: Kernel,
    pub launch: Launch,
    pub version: String,
}

impl HostModel {
    pub fn nu(&self) -> usize {
        self.kernel.nu
    }

    pub fn gain_width() -> usize {
        10
    }

    pub fn bias_width() -> usize {
        10
    }

    fn ints(&self, name: &str) -> Result<&[i32], String> {
        self.fields
            .i32s(name)
            .ok_or_else(|| format!("This MuJoCo build has no model field {name}"))
    }

    fn id(&self, kind: &str, name: &str) -> Option<usize> {
        let bytes = self.fields.u8s("names")?;
        let adr = self.fields.i32s(&format!("name_{kind}adr"))?;

        adr.iter().position(|&a| {
            let rest = bytes.get(a.max(0) as usize..).unwrap_or(&[]);
            let end = rest.iter().position(|&b| b == 0).unwrap_or(rest.len());

            &rest[..end] == name.as_bytes()
        })
    }

    fn joint(&self, name: &str) -> Result<usize, String> {
        self.id("jnt", name)
            .ok_or_else(|| format!("The model has no joint named {name}"))
    }

    fn actuator(&self, name: &str) -> Result<usize, String> {
        self.id("actuator", name)
            .ok_or_else(|| format!("The model has no actuator named {name}"))
    }

    fn limits(&self, actuators: &[usize]) -> Result<(Vec<f64>, Vec<f64>), String> {
        let limited = self
            .fields
            .u8s("actuator_ctrllimited")
            .ok_or("The model has no ctrl limits")?;
        let range = self
            .fields
            .f64s("actuator_ctrlrange")
            .ok_or("The model has no ctrl ranges")?;

        Ok(actuators
            .iter()
            .map(|&a| {
                if limited[a] != 0 {
                    (range[2 * a], range[2 * a + 1])
                } else {
                    (f64::NEG_INFINITY, f64::INFINITY)
                }
            })
            .unzip())
    }

    fn joints(&self, job: &Job) -> Result<Joints, String> {
        let qpos = self.ints("jnt_qposadr")?;
        let dof = self.ints("jnt_dofadr")?;
        let root = self.joint(&job.root)?;
        let ids = job
            .joints
            .iter()
            .map(|j| self.joint(&j.name))
            .collect::<Result<Vec<usize>, String>>()?;
        let actuators = job
            .joints
            .iter()
            .map(|j| self.actuator(&j.name))
            .collect::<Result<Vec<usize>, String>>()?;
        let (ctrl_low, ctrl_high) = self.limits(&actuators)?;

        Ok(Joints {
            root_qpos: qpos[root] as usize,
            root_dof: dof[root] as usize,
            joint_qpos: ids.iter().map(|&j| qpos[j] as usize).collect(),
            joint_dof: ids.iter().map(|&j| dof[j] as usize).collect(),
            actuators,
            ctrl_low,
            ctrl_high,
        })
    }
}

impl Robot {
    pub fn from_host(model: HostModel, job: Job, settled: Settled) -> Result<Self, String> {
        let joints = model.joints(&job)?;
        let layout = RowMap::new(&model.fields)?.offsets();

        if settled.row.len() != layout.nstate {
            return Err("The start row doesn't match the model's state size".to_owned());
        }

        let parts = Assembly {
            timestep: model.kernel.options.timestep,
            nu: model.nu(),
            layout,
            joints,
            settled,
            engine: Engine::Wgsl,
            mujoco: model.version.clone(),
        };

        Ok(Robot::assemble(model, job, parts))
    }
}

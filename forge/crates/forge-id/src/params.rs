use forge_mujoco::{Batch, Model};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Param {
    Armature { dof: usize },
    Damping { dof: usize },
    FrictionLoss { dof: usize },
    Stiffness { actuator: usize },
    Mass { body: usize },
}

#[derive(Clone, Debug)]
pub struct ParamSpec {
    pub name: String,
    pub param: Param,
    pub nominal: f64,
    pub low: f64,
    pub high: f64,
}

impl ParamSpec {
    pub fn around(name: &str, param: Param, nominal: f64) -> Self {
        Self {
            name: name.to_owned(),
            param,
            nominal,
            low: nominal / 4.0,
            high: nominal * 4.0,
        }
    }
}

fn field_name(param: Param) -> &'static str {
    match param {
        Param::Armature { .. } => "dof_armature",
        Param::Damping { .. } => "dof_damping",
        Param::FrictionLoss { .. } => "dof_frictionloss",
        Param::Stiffness { .. } => "actuator_gainprm",
        Param::Mass { .. } => "body_mass",
    }
}

fn write_value(batch: &mut Batch, param: Param, values: &[f64]) -> Result<(), String> {
    let (field, width) = batch.expand(field_name(param))?;

    for (row, value) in field.chunks_exact_mut(width).zip(values) {
        match param {
            Param::Armature { dof } | Param::Damping { dof } | Param::FrictionLoss { dof } => row[dof] = *value,
            Param::Mass { body } => row[body] = *value,
            Param::Stiffness { actuator } => row[actuator * Model::gain_width()] = *value,
        }
    }

    let Param::Stiffness { actuator } = param else {
        return Ok(());
    };
    let (bias, width) = batch.expand("actuator_biasprm")?;

    for (row, value) in bias.chunks_exact_mut(width).zip(values) {
        row[actuator * Model::bias_width() + 1] = -value;
    }

    Ok(())
}

pub fn apply(batch: &mut Batch, specs: &[ParamSpec], sets: &[Vec<f64>]) -> Result<(), String> {
    for (index, spec) in specs.iter().enumerate() {
        let column: Vec<f64> = sets.iter().map(|set| set[index]).collect();

        write_value(batch, spec.param, &column)?;
    }

    let failed = batch.set_const();

    if failed > 0 {
        return Err(format!("mj_setConst failed on {failed} simulations"));
    }

    Ok(())
}

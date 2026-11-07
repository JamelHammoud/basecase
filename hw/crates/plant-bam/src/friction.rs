use crate::params::M6Params;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrictionBudget {
    pub coulomb: f64,
    pub viscous: f64,
}

pub fn friction_budget(params: &M6Params, motor_torque: f64, external_torque: f64, velocity: f64) -> FrictionBudget {
    let gearbox = (external_torque * params.load_friction_external - motor_torque * params.load_friction_motor).abs();
    let gearbox_stribeck = (external_torque * params.load_friction_external_stribeck
        - motor_torque * params.load_friction_motor_stribeck)
        .abs();
    let stribeck = (-(velocity / params.dtheta_stribeck).abs().powf(params.alpha)).exp();
    let quadratic = quadratic_term(params, motor_torque, external_torque);

    FrictionBudget {
        coulomb: params.friction_base + gearbox + stribeck * (params.friction_stribeck + gearbox_stribeck + quadratic),
        viscous: params.friction_viscous,
    }
}

fn quadratic_term(params: &M6Params, motor_torque: f64, external_torque: f64) -> f64 {
    if external_torque.signum() == motor_torque.signum() {
        return 0.0;
    }

    let external = external_torque.abs();
    let motor = motor_torque.abs();

    if external < motor {
        return params.load_friction_external_quad * external * external;
    }

    if external > motor {
        return params.load_friction_motor_quad * motor * motor;
    }

    0.0
}

pub fn applied_friction(budget: FrictionBudget, stopping_torque: f64, velocity: f64) -> f64 {
    let limit = budget.coulomb + budget.viscous * velocity.abs();

    stopping_torque.clamp(-limit, limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::STS3215_7V4;

    #[test]
    fn budget_grows_with_external_load() {
        let params = &STS3215_7V4.0;
        let free = friction_budget(params, 0.0, 0.0, 0.0);
        let loaded = friction_budget(params, 0.0, 1.0, 0.0);

        assert!(loaded.coulomb > free.coulomb);
    }

    #[test]
    fn stribeck_only_helps_when_slow() {
        let params = &STS3215_7V4.0;
        let stopped = friction_budget(params, 0.0, 1.0, 0.0);
        let moving = friction_budget(params, 0.0, 1.0, 2.0);

        assert!(stopped.coulomb > moving.coulomb);
    }

    #[test]
    fn friction_never_exceeds_its_budget_and_never_adds_energy_from_rest() {
        let budget = FrictionBudget {
            coulomb: 0.1,
            viscous: 0.01,
        };

        assert_eq!(applied_friction(budget, 5.0, 0.0), 0.1);
        assert_eq!(applied_friction(budget, -5.0, 10.0), -0.2);
        assert_eq!(applied_friction(budget, 0.05, 0.0), 0.05);
    }
}

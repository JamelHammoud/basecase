use crate::rng::SplitMix;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct M6Params {
    pub kt: f64,
    pub resistance: f64,
    pub armature: f64,
    pub friction_base: f64,
    pub friction_stribeck: f64,
    pub load_friction_motor: f64,
    pub load_friction_external: f64,
    pub load_friction_motor_stribeck: f64,
    pub load_friction_external_stribeck: f64,
    pub load_friction_motor_quad: f64,
    pub load_friction_external_quad: f64,
    pub dtheta_stribeck: f64,
    pub alpha: f64,
    pub friction_viscous: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ControlGains {
    pub error_gain: f64,
    pub error_gain_ratio: f64,
    pub max_duty: f64,
    pub max_velocity: f64,
    pub command_delay_s: f64,
}

pub const STS3215_7V4: (M6Params, ControlGains) = (
    M6Params {
        kt: 1.2753202369175398,
        resistance: 2.753421214375944,
        armature: 0.021564290129722483,
        friction_base: 0.0533134815909817,
        friction_stribeck: 4.257322248151969e-05,
        load_friction_motor: 0.044912012282132555,
        load_friction_external: 0.24355483356616028,
        load_friction_motor_stribeck: 0.00012448975632695385,
        load_friction_external_stribeck: 0.1422905635963302,
        load_friction_motor_quad: 0.007594943296670792,
        load_friction_external_quad: 0.00340408727365082,
        dtheta_stribeck: 0.371136775424206,
        alpha: 9.93094944677977,
        friction_viscous: 0.028160537042911545,
    },
    ControlGains {
        error_gain: 0.166,
        error_gain_ratio: 1.1616979929275297,
        max_duty: 0.97,
        max_velocity: 5.095754044445978,
        command_delay_s: 0.0049807526194816515,
    },
);

pub const XL330: (M6Params, ControlGains) = (
    M6Params {
        kt: 0.3459739511711113,
        resistance: 2.501880848390462,
        armature: 0.001573222677933975,
        friction_base: 0.011919956825702578,
        friction_stribeck: 0.0008513719673776765,
        load_friction_motor: 0.22781736172050673,
        load_friction_external: 0.10651211228971481,
        load_friction_motor_stribeck: 1.4725366831870136e-08,
        load_friction_external_stribeck: 0.14201808120858034,
        load_friction_motor_quad: 0.00526632315329998,
        load_friction_external_quad: 0.00298581585293041,
        dtheta_stribeck: 0.2606668812858925,
        alpha: 8.528815753151498,
        friction_viscous: 0.005788445053875673,
    },
    ControlGains {
        error_gain: 4096.0 / std::f64::consts::TAU / (256.0 * 885.0),
        error_gain_ratio: 1.0,
        max_duty: 1.0,
        max_velocity: 445.0 * 0.229 * std::f64::consts::TAU / 60.0,
        command_delay_s: 0.010220594809412403,
    },
);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UnitParams {
    pub m6: M6Params,
    pub gains: ControlGains,
    pub thermal_resistance: f64,
    pub thermal_capacity: f64,
    pub ambient_c: f64,
    pub backlash_rad: f64,
    pub encoder_counts: f64,
    pub encoder_bias_rad: f64,
}

impl UnitParams {
    pub fn nominal(base: (M6Params, ControlGains)) -> Self {
        Self {
            m6: base.0,
            gains: base.1,
            thermal_resistance: 11.0,
            thermal_capacity: 12.0,
            ambient_c: 25.0,
            backlash_rad: 0.0,
            encoder_counts: 4096.0,
            encoder_bias_rad: 0.0,
        }
    }

    pub fn from_seed(base: (M6Params, ControlGains), seed: u64, servo_id: u8) -> Self {
        let mut rng = SplitMix::new(seed ^ (u64::from(servo_id) << 32) ^ 0x5EED_u64);
        let mut unit = Self::nominal(base);

        unit.m6.kt *= rng.spread(0.05);
        unit.m6.resistance *= rng.spread(0.08);
        unit.m6.armature *= rng.spread(0.10);
        unit.m6.friction_base *= rng.spread(0.20);
        unit.m6.friction_viscous *= rng.spread(0.20);
        unit.m6.load_friction_motor *= rng.spread(0.15);
        unit.m6.load_friction_external *= rng.spread(0.15);
        unit.gains.error_gain_ratio *= rng.spread(0.03);
        unit.thermal_resistance *= rng.spread(0.15);
        unit.thermal_capacity *= rng.spread(0.15);
        unit.backlash_rad = 0.002 + 0.008 * rng.unit();
        unit.encoder_bias_rad = 0.003 * (2.0 * rng.unit() - 1.0);

        unit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn published_values_are_kept_exactly() {
        assert_eq!(STS3215_7V4.0.kt, 1.2753202369175398);
        assert_eq!(STS3215_7V4.0.resistance, 2.753421214375944);
        assert_eq!(XL330.0.kt, 0.3459739511711113);
        assert_eq!(XL330.0.friction_viscous, 0.005788445053875673);
    }

    #[test]
    fn units_differ_by_seed_and_by_id_but_repeat_exactly() {
        let first = UnitParams::from_seed(STS3215_7V4, 1, 1);
        let again = UnitParams::from_seed(STS3215_7V4, 1, 1);
        let other_id = UnitParams::from_seed(STS3215_7V4, 1, 2);
        let other_seed = UnitParams::from_seed(STS3215_7V4, 2, 1);

        assert_eq!(first, again);
        assert_ne!(first.m6.kt, other_id.m6.kt);
        assert_ne!(first.m6.kt, other_seed.m6.kt);
    }
}

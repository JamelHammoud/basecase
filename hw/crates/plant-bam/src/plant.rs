use crate::friction::{applied_friction, friction_budget};
use crate::params::UnitParams;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DriveInput {
    pub duty: f64,
    pub enabled: bool,
    pub bus_volts: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Load {
    pub inertia: f64,
    pub gravity_torque: f64,
    pub gravity_phase: f64,
    pub constant_torque: f64,
}

impl Default for Load {
    fn default() -> Self {
        Self {
            inertia: 0.002,
            gravity_torque: 0.0,
            gravity_phase: 0.0,
            constant_torque: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct PlantFaults {
    pub stuck: bool,
    pub inverted_drive: bool,
    pub extra_heat_watts: f64,
}

#[derive(Debug, Clone)]
pub struct Plant {
    pub unit: UnitParams,
    pub load: Load,
    pub faults: PlantFaults,
    position: f64,
    velocity: f64,
    current: f64,
    temperature_c: f64,
    output_position: f64,
}

impl Plant {
    pub fn new(unit: UnitParams, load: Load, position: f64) -> Self {
        let ambient = unit.ambient_c;

        Self {
            unit,
            load,
            faults: PlantFaults::default(),
            position,
            velocity: 0.0,
            current: 0.0,
            temperature_c: ambient,
            output_position: position,
        }
    }

    pub fn step(&mut self, input: DriveInput, dt: f64) {
        let polarity = if self.faults.inverted_drive { -1.0 } else { 1.0 };
        let volts = polarity * input.duty * (input.bus_volts * self.unit.supply_scale);
        let params = self.unit.m6;
        let (motor_torque, current) = if input.enabled {
            let current = (volts - params.kt * self.velocity) / params.resistance;

            (params.kt * current, current)
        } else {
            (0.0, 0.0)
        };
        let external = self.external_torque();
        let inertia = self.load.inertia + params.armature;
        let drive = motor_torque + external;

        self.current = current;
        self.integrate_motion(drive, (motor_torque, external), inertia, dt);
        self.integrate_heat(dt);
        self.track_output();
    }

    fn integrate_motion(&mut self, drive: f64, torques: (f64, f64), inertia: f64, dt: f64) {
        if self.faults.stuck {
            self.velocity = 0.0;

            return;
        }

        let budget = friction_budget(&self.unit.m6, torques.0, torques.1, self.velocity);
        let stopping = -(drive + inertia * self.velocity / dt);
        let friction = applied_friction(budget, stopping, self.velocity);

        self.velocity += dt * (drive + friction) / inertia;
        self.position += dt * self.velocity;
    }

    fn integrate_heat(&mut self, dt: f64) {
        let heating = self.current * self.current * self.unit.m6.resistance + self.faults.extra_heat_watts;
        let cooling = (self.temperature_c - self.unit.ambient_c) / self.unit.thermal_resistance;

        self.temperature_c += dt * (heating - cooling) / self.unit.thermal_capacity;
    }

    fn track_output(&mut self) {
        let half_gap = self.unit.backlash_rad / 2.0;

        self.output_position = self
            .output_position
            .clamp(self.position - half_gap, self.position + half_gap);
    }

    fn external_torque(&self) -> f64 {
        self.load.gravity_torque * (self.position + self.load.gravity_phase).sin() + self.load.constant_torque
    }

    pub fn encoder_position(&self) -> f64 {
        let per_count = std::f64::consts::TAU / self.unit.encoder_counts;

        ((self.output_position + self.unit.encoder_bias_rad) / per_count).round() * per_count
    }

    pub fn velocity(&self) -> f64 {
        self.velocity
    }

    pub fn current(&self) -> f64 {
        self.current
    }

    pub fn temperature_c(&self) -> f64 {
        self.temperature_c
    }

    pub fn set_temperature_c(&mut self, value: f64) {
        self.temperature_c = value;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::{STS3215_7V4, XL330};
    use proptest::prelude::*;

    fn plant() -> Plant {
        Plant::new(UnitParams::nominal(STS3215_7V4), Load::default(), 0.0)
    }

    fn drive(duty: f64) -> DriveInput {
        DriveInput {
            duty,
            enabled: true,
            bus_volts: 7.4,
        }
    }

    #[test]
    fn positive_duty_moves_positive() {
        let mut plant = plant();

        for _ in 0..500 {
            plant.step(drive(0.5), 0.001);
        }

        assert!(plant.encoder_position() > 0.1);
    }

    #[test]
    fn torque_off_with_no_load_stays_put() {
        let mut plant = plant();

        for _ in 0..1000 {
            plant.step(
                DriveInput {
                    duty: 1.0,
                    enabled: false,
                    bus_volts: 7.4,
                },
                0.001,
            );
        }

        assert_eq!(plant.encoder_position(), 0.0);
        assert_eq!(plant.current(), 0.0);
    }

    #[test]
    fn stuck_plant_does_not_move_but_draws_stall_current() {
        let mut plant = plant();

        plant.faults.stuck = true;

        for _ in 0..200 {
            plant.step(drive(0.5), 0.001);
        }

        assert_eq!(plant.encoder_position(), 0.0);
        assert!((plant.current() - 0.5 * 7.4 / STS3215_7V4.0.resistance).abs() < 1e-9);
    }

    #[test]
    fn a_unit_rated_above_the_bus_drives_at_its_own_supply() {
        let mut unit = UnitParams::nominal(STS3215_7V4);

        unit.supply_scale = 1.5;

        let mut plant = Plant::new(unit, Load::default(), 0.0);

        plant.faults.stuck = true;
        plant.step(drive(0.5), 0.001);

        assert!((plant.current() - 0.5 * 7.4 * 1.5 / STS3215_7V4.0.resistance).abs() < 1e-9);
    }

    #[test]
    fn inverted_drive_reverses_motion() {
        let mut plant = plant();

        plant.faults.inverted_drive = true;

        for _ in 0..500 {
            plant.step(drive(0.5), 0.001);
        }

        assert!(plant.encoder_position() < -0.1);
    }

    #[test]
    fn stall_current_heats_the_winding_and_it_cools_when_off() {
        let mut plant = plant();

        plant.faults.stuck = true;

        for _ in 0..30_000 {
            plant.step(drive(0.5), 0.001);
        }

        let hot = plant.temperature_c();

        assert!(hot > 26.0);

        for _ in 0..30_000 {
            plant.step(
                DriveInput {
                    duty: 0.0,
                    enabled: false,
                    bus_volts: 7.4,
                },
                0.001,
            );
        }

        assert!(plant.temperature_c() < hot);
    }

    #[test]
    fn encoder_is_quantised_to_counts() {
        let mut plant = plant();

        for _ in 0..137 {
            plant.step(drive(0.3), 0.001);
        }

        let counts = plant.encoder_position() * 4096.0 / std::f64::consts::TAU;

        assert!((counts - counts.round()).abs() < 1e-6);
    }

    #[test]
    fn backlash_leaves_a_gap_before_the_output_follows() {
        let mut unit = UnitParams::nominal(STS3215_7V4);

        unit.backlash_rad = 0.1;
        unit.encoder_counts = 1e9;

        let mut plant = Plant::new(unit, Load::default(), 0.0);

        for _ in 0..12 {
            plant.step(drive(0.3), 0.001);
        }

        assert!(plant.encoder_position().abs() < 0.05 + 1e-6);
    }

    proptest! {
        #[test]
        fn position_stays_finite_under_any_drive(duties in proptest::collection::vec(-1.0f64..=1.0, 1..200), xl in any::<bool>()) {
            let base = if xl { XL330 } else { STS3215_7V4 };
            let mut plant = Plant::new(UnitParams::from_seed(base, 3, 1), Load::default(), 0.0);

            for duty in duties {
                plant.step(drive(duty), 0.001);
                prop_assert!(plant.encoder_position().is_finite());
                prop_assert!(plant.velocity().abs() < 1000.0);
            }
        }
    }
}

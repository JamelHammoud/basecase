use plant_bam::{ControlGains, DriveInput, Load, M6Params, Plant, UnitParams, STS3215_7V4, XL330};
use std::f64::consts::{PI, TAU};
use std::fmt::Write as _;

const SAMPLE_S: f64 = 0.002;
const SUBSTEPS: usize = 4;
const GRAVITY: f64 = 9.81;
const BOB_SIDE_M: f64 = 0.02;

struct Servo {
    id: &'static str,
    base: (M6Params, ControlGains),
    volts: f64,
    firmware_kp: f64,
    rate_limited: bool,
    masses_kg: [f64; 2],
    arms_m: [f64; 2],
}

const SERVOS: [Servo; 2] = [
    Servo {
        id: "sts3215",
        base: STS3215_7V4,
        volts: 7.4,
        firmware_kp: 32.0,
        rate_limited: true,
        masses_kg: [0.2, 0.5],
        arms_m: [0.1, 0.2],
    },
    Servo {
        id: "xl330",
        base: XL330,
        volts: 5.0,
        firmware_kp: 400.0,
        rate_limited: false,
        masses_kg: [0.05, 0.15],
        arms_m: [0.05, 0.1],
    },
];

#[derive(Clone, Copy)]
enum Profile {
    Step,
    Chirp,
    Multisine,
    Hold,
}

const PROFILES: [Profile; 4] = [Profile::Step, Profile::Chirp, Profile::Multisine, Profile::Hold];

const MULTISINE_HZ: [f64; 5] = [0.4, 0.9, 1.7, 2.9, 4.1];

impl Profile {
    fn name(self) -> &'static str {
        match self {
            Profile::Step => "step",
            Profile::Chirp => "chirp",
            Profile::Multisine => "multisine",
            Profile::Hold => "hold",
        }
    }

    fn seconds(self) -> f64 {
        match self {
            Profile::Step => 2.4,
            Profile::Chirp => 10.0,
            Profile::Multisine => 6.0,
            Profile::Hold => 4.0,
        }
    }

    fn command(self, t: f64) -> f64 {
        match self {
            Profile::Step => step(t),
            Profile::Chirp => chirp(t, self.seconds()),
            Profile::Multisine => multisine(t),
            Profile::Hold => hold(t),
        }
    }
}

fn step(t: f64) -> f64 {
    if (0.2..1.4).contains(&t) {
        0.5
    } else {
        0.0
    }
}

fn chirp(t: f64, seconds: f64) -> f64 {
    let (low, high) = (0.2, 5.0);
    let phase = TAU * (low * t + (high - low) * t * t / (2.0 * seconds));

    0.2 * phase.sin()
}

fn multisine(t: f64) -> f64 {
    let fade_in = (t / 0.3).min(1.0);
    let sum: f64 = MULTISINE_HZ
        .iter()
        .enumerate()
        .map(|(k, hz)| {
            let index = k as f64;

            (TAU * hz * t - PI * index * (index + 1.0) / MULTISINE_HZ.len() as f64).sin()
        })
        .sum();

    0.06 * fade_in * sum
}

fn hold(t: f64) -> f64 {
    let rise = ((t - 0.2) / 0.8).clamp(0.0, 1.0);

    1.0 * (1.0 - (PI * rise).cos()) / 2.0
}

struct Firmware {
    gain: f64,
    max_duty: f64,
    max_velocity: f64,
    rate_limited: bool,
    smooth: Option<f64>,
}

impl Firmware {
    fn new(servo: &Servo) -> Self {
        let gains = servo.base.1;

        Self {
            gain: servo.firmware_kp * gains.error_gain * gains.error_gain_ratio,
            max_duty: gains.max_duty,
            max_velocity: gains.max_velocity,
            rate_limited: servo.rate_limited,
            smooth: None,
        }
    }

    fn duty(&mut self, goal: f64, q: f64, dt: f64) -> f64 {
        let target = if self.rate_limited {
            let previous = self.smooth.unwrap_or(q);
            let reach = self.max_velocity * dt;
            let next = goal.clamp(previous - reach, previous + reach);

            self.smooth = Some(next);
            next
        } else {
            goal
        };

        ((target - q) * self.gain).clamp(-self.max_duty, self.max_duty)
    }
}

fn delayed(commands: &[f64], t: f64) -> f64 {
    let at = (t / SAMPLE_S).max(0.0);
    let index = at.floor() as usize;

    if index + 1 >= commands.len() {
        return commands[commands.len() - 1];
    }

    let frac = at - index as f64;

    commands[index] * (1.0 - frac) + commands[index + 1] * frac
}

struct Run {
    servo: &'static str,
    volts: f64,
    mass_kg: f64,
    arm_m: f64,
    profile: &'static str,
    command: Vec<f64>,
    position: Vec<f64>,
}

fn simulate(servo: &Servo, mass_kg: f64, arm_m: f64, profile: Profile) -> Run {
    let samples = (profile.seconds() / SAMPLE_S).round() as usize;
    let command: Vec<f64> = (0..samples).map(|k| profile.command(k as f64 * SAMPLE_S)).collect();
    let load = Load {
        inertia: mass_kg * arm_m * arm_m + mass_kg * BOB_SIDE_M * BOB_SIDE_M / 6.0,
        gravity_torque: -mass_kg * GRAVITY * arm_m,
        gravity_phase: 0.0,
        constant_torque: 0.0,
    };
    let mut plant = Plant::new(UnitParams::nominal(servo.base), load, 0.0);
    let mut firmware = Firmware::new(servo);
    let delay = servo.base.1.command_delay_s;
    let dt = SAMPLE_S / SUBSTEPS as f64;
    let mut position = Vec::with_capacity(samples);

    for k in 0..samples {
        position.push(plant.encoder_position());

        for s in 0..SUBSTEPS {
            let t = k as f64 * SAMPLE_S + s as f64 * dt;
            let goal = delayed(&command, t - delay);
            let duty = firmware.duty(goal, plant.encoder_position(), dt);
            let input = DriveInput {
                duty,
                enabled: true,
                bus_volts: servo.volts,
            };

            plant.step(input, dt);
        }
    }

    Run {
        servo: servo.id,
        volts: servo.volts,
        mass_kg,
        arm_m,
        profile: profile.name(),
        command,
        position,
    }
}

fn numbers(values: &[f64]) -> String {
    let parts: Vec<String> = values.iter().map(|v| format!("{:.7}", v)).collect();

    format!("[{}]", parts.join(","))
}

fn run_json(run: &Run) -> String {
    let mut out = String::new();

    let _ = write!(
        out,
        "{{\"servo\":\"{}\",\"volts\":{},\"massKg\":{},\"armM\":{},\"profile\":\"{}\",\"command\":{},\"position\":{}}}",
        run.servo,
        run.volts,
        run.mass_kg,
        run.arm_m,
        run.profile,
        numbers(&run.command),
        numbers(&run.position)
    );

    out
}

fn main() {
    let mut runs = Vec::new();

    for servo in &SERVOS {
        for &mass_kg in &servo.masses_kg {
            for &arm_m in &servo.arms_m {
                for &profile in &PROFILES {
                    runs.push(run_json(&simulate(servo, mass_kg, arm_m, profile)));
                }
            }
        }
    }

    println!(
        "{{\"source\":\"plant-bam nominal M6\",\"sampleS\":{},\"gravity\":{},\"bobSideM\":{},\"runs\":[{}]}}",
        SAMPLE_S,
        GRAVITY,
        BOB_SIDE_M,
        runs.join(",")
    );
}

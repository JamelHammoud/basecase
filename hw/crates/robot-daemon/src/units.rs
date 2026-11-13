use serde::Deserialize;
use servo_emu::{ControlGains, M6Params, PartModel};

pub const MAX_VOLTS: f64 = 60.0;
pub const MAX_VALUE: f64 = 1.0e4;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Friction {
    pub base: f64,
    pub stribeck: f64,
    pub load_motor: f64,
    pub load_external: f64,
    pub load_motor_stribeck: f64,
    pub load_external_stribeck: f64,
    pub load_motor_quad: f64,
    pub load_external_quad: f64,
    pub dtheta_stribeck: f64,
    pub alpha: f64,
    pub viscous: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ServoUnit {
    pub volts: f64,
    pub kt: f64,
    pub resistance: f64,
    pub armature: f64,
    pub friction: Friction,
    pub firmware_kp: f64,
    pub error_gain: f64,
    pub error_gain_ratio: f64,
    pub max_duty: f64,
    pub max_velocity: f64,
    pub delay_s: f64,
}

pub fn parse_units(bytes: &[u8], ids: &[u8]) -> Result<Vec<Option<PartModel>>, String> {
    let units: Vec<Option<ServoUnit>> =
        serde_json::from_slice(bytes).map_err(|error| format!("The servo models file can't be read: {error}"))?;

    if units.len() != ids.len() {
        return Err("The servo models file must give one entry per servo ID.".into());
    }

    units
        .iter()
        .zip(ids)
        .map(|(unit, id)| unit.map(|unit| checked_unit(&unit, *id)).transpose())
        .collect()
}

fn checked_unit(unit: &ServoUnit, id: u8) -> Result<PartModel, String> {
    if unit.in_bounds() {
        return Ok(unit.part_model());
    }

    Err(format!("The model for servo {id} has a number out of range."))
}

fn positive(value: f64) -> bool {
    value.is_finite() && value > 0.0 && value <= MAX_VALUE
}

fn non_negative(value: f64) -> bool {
    value.is_finite() && (0.0..=MAX_VALUE).contains(&value)
}

impl Friction {
    fn values(&self) -> [f64; 11] {
        [
            self.base,
            self.stribeck,
            self.load_motor,
            self.load_external,
            self.load_motor_stribeck,
            self.load_external_stribeck,
            self.load_motor_quad,
            self.load_external_quad,
            self.dtheta_stribeck,
            self.alpha,
            self.viscous,
        ]
    }
}

impl ServoUnit {
    fn in_bounds(&self) -> bool {
        let others = [
            self.kt,
            self.resistance,
            self.armature,
            self.firmware_kp,
            self.error_gain,
            self.error_gain_ratio,
            self.max_duty,
            self.max_velocity,
            self.delay_s,
        ];

        positive(self.volts)
            && self.volts <= MAX_VOLTS
            && others.into_iter().all(positive)
            && self.friction.values().into_iter().all(non_negative)
    }

    fn part_model(&self) -> PartModel {
        let friction = self.friction;

        PartModel {
            m6: M6Params {
                kt: self.kt,
                resistance: self.resistance,
                armature: self.armature,
                friction_base: friction.base,
                friction_stribeck: friction.stribeck,
                load_friction_motor: friction.load_motor,
                load_friction_external: friction.load_external,
                load_friction_motor_stribeck: friction.load_motor_stribeck,
                load_friction_external_stribeck: friction.load_external_stribeck,
                load_friction_motor_quad: friction.load_motor_quad,
                load_friction_external_quad: friction.load_external_quad,
                dtheta_stribeck: friction.dtheta_stribeck,
                alpha: friction.alpha,
                friction_viscous: friction.viscous,
            },
            gains: ControlGains {
                error_gain: self.error_gain,
                error_gain_ratio: self.error_gain_ratio,
                max_duty: self.max_duty,
                max_velocity: self.max_velocity,
                command_delay_s: self.delay_s,
            },
            firmware_kp: self.firmware_kp,
            volts: self.volts,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const XL430: &str = r#"{"volts":11.1,"kt":0.9,"resistance":4.1,"armature":0.01,
        "friction":{"base":0.03,"stribeck":0.0001,"loadMotor":0.04,"loadExternal":0.2,"loadMotorStribeck":1e-8,
        "loadExternalStribeck":0.14,"loadMotorQuad":0.007,"loadExternalQuad":0.003,"dthetaStribeck":0.37,
        "alpha":9.9,"viscous":0.03},
        "firmwareKp":32,"errorGain":0.166,"errorGainRatio":1.16,"maxDuty":0.97,"maxVelocity":5.1,"delayS":0.005}"#;

    fn file(entries: &[&str]) -> Vec<u8> {
        format!("[{}]", entries.join(",")).into_bytes()
    }

    #[test]
    fn parses_one_model_or_null_per_servo() {
        let units = parse_units(&file(&[XL430, "null"]), &[1, 2]).unwrap();
        let part = units[0].unwrap();

        assert_eq!(units[1], None);
        assert_eq!(part.volts, 11.1);
        assert_eq!(part.firmware_kp, 32.0);
        assert_eq!(part.m6.load_friction_motor_stribeck, 1e-8);
        assert_eq!(part.m6.dtheta_stribeck, 0.37);
        assert_eq!(part.gains.command_delay_s, 0.005);
    }

    #[test]
    fn refuses_a_file_that_does_not_line_up_with_the_ids() {
        let message = parse_units(&file(&[XL430]), &[1, 2]).unwrap_err();

        assert_eq!(message, "The servo models file must give one entry per servo ID.");
        assert!(parse_units(b"{", &[1]).is_err());
        assert!(parse_units(b"{\"units\":[]}", &[]).is_err());
    }

    #[test]
    fn refuses_unknown_or_missing_keys() {
        let extra = XL430.replace("\"volts\"", "\"port\":1,\"volts\"");
        let missing = XL430.replace("\"alpha\":9.9,", "");
        let extra_friction = XL430.replace("\"base\"", "\"drag\":1,\"base\"");

        for bad in [extra, missing, extra_friction] {
            assert!(parse_units(&file(&[&bad]), &[1]).is_err(), "{bad}");
        }
    }

    #[test]
    fn refuses_numbers_out_of_range() {
        let cases = [
            XL430.replace("\"volts\":11.1", "\"volts\":61"),
            XL430.replace("\"kt\":0.9", "\"kt\":0"),
            XL430.replace("\"kt\":0.9", "\"kt\":-0.9"),
            XL430.replace("\"base\":0.03", "\"base\":-0.03"),
            XL430.replace("\"maxVelocity\":5.1", "\"maxVelocity\":1e5"),
            XL430.replace("\"kt\":0.9", "\"kt\":1e400"),
            XL430.replace("\"kt\":0.9", "\"kt\":\"0.9\""),
        ];

        for bad in cases {
            let message = parse_units(&file(&["null", &bad]), &[1, 7]).unwrap_err();

            assert!(
                message == "The model for servo 7 has a number out of range." || message.contains("can't be read"),
                "{message}"
            );
        }
    }

    #[test]
    fn friction_may_be_zero() {
        let still = XL430.replace("\"base\":0.03", "\"base\":0");

        assert!(parse_units(&file(&[&still]), &[1]).is_ok());
    }
}

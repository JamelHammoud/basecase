use crate::intent::MAX_JOINTS;
use crate::safety::CountBounds;
use serde::{Deserialize, Serialize};
use std::f32::consts::TAU;

pub const COUNTS_PER_TURN: f32 = 4096.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RobotClass {
    #[default]
    Arm,
    Legged,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JointCalibration {
    pub id: u8,
    pub name: String,
    pub zero_counts: i32,
    pub direction: i8,
    pub min_rad: f32,
    pub max_rad: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Calibration {
    pub joints: Vec<JointCalibration>,
    #[serde(default)]
    pub class: RobotClass,
    #[serde(default)]
    pub stand_pose: Option<Vec<f32>>,
}

impl Calibration {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let calibration: Calibration =
            serde_json::from_slice(bytes).map_err(|error| format!("The calibration file can't be read: {error}"))?;

        calibration.validate()?;

        Ok(calibration)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.joints.is_empty() || self.joints.len() > MAX_JOINTS {
            return Err(format!("Calibration needs 1 to {MAX_JOINTS} joints."));
        }

        let mut seen = Vec::new();

        for joint in &self.joints {
            joint.validate()?;

            if seen.contains(&joint.id) {
                return Err(format!("Calibration lists servo {} twice.", joint.id));
            }

            seen.push(joint.id);
        }

        self.validate_stand_pose()
    }

    fn validate_stand_pose(&self) -> Result<(), String> {
        let Some(pose) = &self.stand_pose else {
            return Ok(());
        };

        let fits = pose.len() == self.joints.len()
            && pose
                .iter()
                .zip(&self.joints)
                .all(|(rad, joint)| rad.is_finite() && *rad >= joint.min_rad && *rad <= joint.max_rad);

        if fits {
            Ok(())
        } else {
            Err("The stand pose must give one angle per joint, inside each joint's range.".into())
        }
    }

    pub fn ids(&self) -> Vec<u8> {
        self.joints.iter().map(|joint| joint.id).collect()
    }
}

impl JointCalibration {
    fn validate(&self) -> Result<(), String> {
        let finite = self.min_rad.is_finite() && self.max_rad.is_finite();
        let ordered = self.min_rad < self.max_rad;
        let inside_turn = self.max_rad - self.min_rad <= TAU * 0.95;
        let zero_ok = (0..4096).contains(&self.zero_counts);
        let direction_ok = self.direction == 1 || self.direction == -1;

        if !(finite && ordered && inside_turn) {
            return Err(format!("Joint {} has an impossible range.", self.name));
        }

        if !(zero_ok && direction_ok) {
            return Err(format!("Joint {} has a bad zero or direction.", self.name));
        }

        let bounds = self.bounds();

        if bounds.min < 0 || bounds.max > 4095 {
            return Err(format!(
                "Joint {}'s range runs past the end of the servo's turn.",
                self.name
            ));
        }

        Ok(())
    }

    pub fn counts_from_rad(&self, rad: f32) -> Option<i32> {
        if !rad.is_finite() {
            return None;
        }

        let counts = self.zero_counts as f32 + f32::from(self.direction) * rad * COUNTS_PER_TURN / TAU;

        Some(counts.round().clamp(-1.0e6, 1.0e6) as i32)
    }

    pub fn rad_from_counts(&self, counts: i32) -> f32 {
        f32::from(self.direction) * (counts - self.zero_counts) as f32 * TAU / COUNTS_PER_TURN
    }

    pub fn bounds(&self) -> CountBounds {
        let first = self.counts_from_rad(self.min_rad).unwrap_or(self.zero_counts);
        let second = self.counts_from_rad(self.max_rad).unwrap_or(self.zero_counts);

        CountBounds {
            min: first.min(second),
            max: first.max(second),
        }
    }
}

#[cfg(test)]
pub mod fixtures {
    use super::*;

    pub fn three_joint_arm() -> Calibration {
        Calibration {
            joints: (1..=3)
                .map(|id| JointCalibration {
                    id,
                    name: format!("joint {id}"),
                    zero_counts: 2048,
                    direction: if id == 2 { -1 } else { 1 },
                    min_rad: -1.5,
                    max_rad: 1.5,
                })
                .collect(),
            class: RobotClass::Arm,
            stand_pose: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::three_joint_arm;
    use super::*;

    #[test]
    fn round_trips_angles_through_counts() {
        let joint = &three_joint_arm().joints[1];
        let counts = joint.counts_from_rad(0.5).unwrap();

        assert!((joint.rad_from_counts(counts) - 0.5).abs() < 0.002);
        assert!(counts < 2048);
    }

    #[test]
    fn bounds_are_ordered_even_for_reversed_joints() {
        let joint = &three_joint_arm().joints[1];
        let bounds = joint.bounds();

        assert!(bounds.min < bounds.max);
    }

    #[test]
    fn not_finite_angles_have_no_counts() {
        let joint = &three_joint_arm().joints[0];

        assert_eq!(joint.counts_from_rad(f32::NAN), None);
        assert_eq!(joint.counts_from_rad(f32::INFINITY), None);
    }

    #[test]
    fn refuses_broken_files() {
        assert!(Calibration::parse(b"{").is_err());

        let mut duplicate = three_joint_arm();

        duplicate.joints[1].id = 1;
        assert!(duplicate.validate().is_err());

        let mut inverted = three_joint_arm();

        inverted.joints[0].min_rad = 2.0;
        assert!(inverted.validate().is_err());

        let mut off_the_end = three_joint_arm();

        off_the_end.joints[0].zero_counts = 100;
        assert!(off_the_end.validate().is_err());

        let mut bad_pose = three_joint_arm();

        bad_pose.stand_pose = Some(vec![0.0, 9.0, 0.0]);
        assert!(bad_pose.validate().is_err());
    }

    #[test]
    fn parses_the_documented_shape() {
        let text =
            br#"{"joints":[{"id":1,"name":"base","zero_counts":2048,"direction":1,"min_rad":-1.0,"max_rad":1.0}]}"#;
        let calibration = Calibration::parse(text).unwrap();

        assert_eq!(calibration.class, RobotClass::Arm);
        assert_eq!(calibration.ids(), vec![1]);
    }
}

use servo_wire::Family;

#[derive(Debug, Clone, PartialEq)]
pub enum Fault {
    BusGone,
    BusSilent,
    NoReply { id: u8 },
    Garbled { id: u8 },
    WrongId { asked: u8, answered: u8 },
    RepliesLate,
    Overheat { id: u8, temp_c: f32 },
    Voltage { id: u8, volts: f32 },
    UnexpectedTorqueOff { id: u8 },
    ServoProtection { id: u8 },
    BusWatchdogTripped { id: u8 },
    Stall { id: u8, joint: String },
    WrongDirection { id: u8, joint: String },
    OutOfRange { id: u8, joint: String },
    DuplicateId { id: u8 },
    WrongModel { id: u8, found: u16, expected: u16 },
    PolicyNotFinite,
    PolicyStale,
    IntentNotFinite,
    IntentStale,
    ClientLost,
    WriteRefused { detail: String },
    StateLost,
    StateCorrupt,
    MotorsMissing { count: usize },
    MotorError { joint: String },
    NotBalancing { fsm: Option<i64> },
}

impl Fault {
    pub fn code(&self) -> &'static str {
        match self {
            Fault::BusGone => "bus_gone",
            Fault::BusSilent => "bus_silent",
            Fault::NoReply { .. } => "no_reply",
            Fault::Garbled { .. } => "garbled",
            Fault::WrongId { .. } => "wrong_id",
            Fault::RepliesLate => "replies_late",
            Fault::Overheat { .. } => "overheat",
            Fault::Voltage { .. } => "voltage",
            Fault::UnexpectedTorqueOff { .. } => "servo_restarted",
            Fault::ServoProtection { .. } => "servo_protection",
            Fault::BusWatchdogTripped { .. } => "bus_watchdog",
            Fault::Stall { .. } => "stall",
            Fault::WrongDirection { .. } => "wrong_direction",
            Fault::OutOfRange { .. } => "out_of_range",
            Fault::DuplicateId { .. } => "duplicate_id",
            Fault::WrongModel { .. } => "wrong_model",
            Fault::PolicyNotFinite => "policy_not_finite",
            Fault::PolicyStale => "policy_stale",
            Fault::IntentNotFinite => "intent_not_finite",
            Fault::IntentStale => "intent_stale",
            Fault::ClientLost => "client_lost",
            Fault::WriteRefused { .. } => "write_refused",
            Fault::StateLost => "lowstate_lost",
            Fault::StateCorrupt => "lowstate_crc",
            Fault::MotorsMissing { .. } => "motors_missing",
            Fault::MotorError { .. } => "motor_error",
            Fault::NotBalancing { .. } => "not_balancing",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Fault::BusGone => "The servo adapter was unplugged. Plug it back in, then start again.".into(),
            Fault::BusSilent => {
                "No servo is answering, so nothing is being moved. Check that the servos have power and the cable is in."
                    .into()
            }
            Fault::NoReply { id } => {
                format!("Servo {id} stopped answering, so the robot is holding still. Check its cable, then start again.")
            }
            Fault::Garbled { id } => format!(
                "Messages from servo {id} are garbled, so the robot is holding still. Check its cable, and that no other servo uses ID {id}."
            ),
            Fault::WrongId { asked, answered } => format!(
                "Servo {answered} answered when servo {asked} was asked, so the robot is holding still. Give each servo its own ID, one servo at a time."
            ),
            Fault::RepliesLate => {
                "Servo replies are arriving too late, so the robot is holding still. Unplug other USB devices, then start again."
                    .into()
            }
            Fault::Overheat { id, temp_c } => format!(
                "Servo {id} reached {temp_c:.0} °C, so it was switched off to cool down. Let it rest for 10 minutes."
            ),
            Fault::Voltage { volts, .. } => format!(
                "The servo supply is at {volts:.1} V, outside the safe range, so all motors were switched off. Check the battery or power supply."
            ),
            Fault::UnexpectedTorqueOff { id } => format!(
                "Servo {id} restarted on its own, most likely because the power dipped. All motors were switched off. Check the power supply, then start again."
            ),
            Fault::ServoProtection { id } => format!(
                "Servo {id} cut its own power because it was overloaded. Its motor was switched off. Check that nothing is pushing against it."
            ),
            Fault::BusWatchdogTripped { id } => {
                format!("Servo {id} stopped itself because commands paused. All motors were switched off.")
            }
            Fault::Stall { joint, .. } => format!(
                "The {joint} joint is stuck: its motor is pushing but nothing moves. Its motor was switched off. Check for something blocking it."
            ),
            Fault::WrongDirection { joint, .. } => format!(
                "The {joint} joint moved the wrong way, so its motor was switched off. Check its direction in calibration."
            ),
            Fault::OutOfRange { joint, .. } => format!(
                "The {joint} joint is outside its calibrated range, so the motors stay off. Move it back by hand, then start again."
            ),
            Fault::DuplicateId { id } => {
                format!("Two servos answer to ID {id}. Connect one servo at a time and give each its own ID.")
            }
            Fault::WrongModel { id, found, expected } => format!(
                "Servo {id} reports model {found}, but this robot expects model {expected}. Check that the right servo is connected."
            ),
            Fault::PolicyNotFinite => {
                "The policy produced a value that isn't a number, so the robot is holding still. Retrain or reload the policy."
                    .into()
            }
            Fault::PolicyStale => "The policy stopped answering, so the robot is holding still.".into(),
            Fault::IntentNotFinite => "A command contained a value that isn't a number, so the robot is holding still.".into(),
            Fault::IntentStale => "Commands stopped arriving, so the robot is holding still.".into(),
            Fault::ClientLost => "The app stopped talking to the robot, so the robot is holding still.".into(),
            Fault::WriteRefused { detail } => format!("A motor command was refused ({detail}), so the robot is holding still."),
            Fault::StateLost => {
                "The G1 stopped sending its state, so its arms went back to its own controller. Check the Ethernet cable, then start again."
                    .into()
            }
            Fault::StateCorrupt => {
                "The G1's state messages arrive damaged, so its arms went back to its own controller. Check the Ethernet cable, then start again."
                    .into()
            }
            Fault::MotorsMissing { count } => format!(
                "{count} of the G1's 29 motors aren't answering, so nothing will move. Restart the G1, then check again."
            ),
            Fault::MotorError { joint } => format!(
                "The G1 reports an error on its {joint} motor, so its arms went back to its own controller."
            ),
            Fault::NotBalancing { .. } => {
                "The G1 isn't balancing in its locomotion mode, so its arms stay with its own controller. Stand it up with its remote, then check again."
                    .into()
            }
        }
    }
}

const HANDED_BACK: &str = "so the G1's arms went back to its own controller.";

impl Fault {
    pub fn g1_message(&self) -> String {
        match self {
            Fault::ClientLost => format!("The app stopped talking to the robot, {HANDED_BACK}"),
            Fault::IntentStale => format!("Commands stopped arriving, {HANDED_BACK}"),
            Fault::IntentNotFinite => format!("A command contained a value that isn't a number, {HANDED_BACK}"),
            Fault::WriteRefused { detail } => format!("An arm command was refused ({detail}), {HANDED_BACK}"),
            Fault::BusGone => format!("The robot's network link closed, {HANDED_BACK} Check the Ethernet cable."),
            Fault::OutOfRange { joint, .. } => format!(
                "The {joint} joint is outside its calibrated range, so the G1's arms stay with its own controller."
            ),
            other => other.message(),
        }
    }
}

pub fn g1_lost_message() -> String {
    "Lost contact with the robot. The G1 keeps its last arm command, so hold its remote's emergency stop.".into()
}

pub fn daemon_lost_message(family: Family) -> String {
    match family {
        Family::Dynamixel => {
            "Lost contact with the robot. Its Dynamixel servos stop on their own within 100 ms.".into()
        }
        Family::Feetech => {
            "Lost contact with the robot. Feetech servos keep holding their last position, so switch off their power."
                .into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BANNED: [&str; 7] = ["please", "simply", "successfully", "oops", "invalid", " yet", "·"];

    fn all_faults() -> Vec<Fault> {
        let joint = String::from("elbow");

        vec![
            Fault::BusGone,
            Fault::BusSilent,
            Fault::NoReply { id: 2 },
            Fault::Garbled { id: 2 },
            Fault::WrongId { asked: 2, answered: 9 },
            Fault::RepliesLate,
            Fault::Overheat { id: 2, temp_c: 51.0 },
            Fault::Voltage { id: 2, volts: 5.1 },
            Fault::UnexpectedTorqueOff { id: 2 },
            Fault::ServoProtection { id: 2 },
            Fault::BusWatchdogTripped { id: 2 },
            Fault::Stall {
                id: 2,
                joint: joint.clone(),
            },
            Fault::WrongDirection {
                id: 2,
                joint: joint.clone(),
            },
            Fault::OutOfRange { id: 2, joint },
            Fault::DuplicateId { id: 2 },
            Fault::WrongModel {
                id: 2,
                found: 778,
                expected: 777,
            },
            Fault::PolicyNotFinite,
            Fault::PolicyStale,
            Fault::IntentNotFinite,
            Fault::IntentStale,
            Fault::ClientLost,
            Fault::WriteRefused {
                detail: "sealed".into(),
            },
            Fault::StateLost,
            Fault::StateCorrupt,
            Fault::MotorsMissing { count: 2 },
            Fault::MotorError {
                joint: "right_elbow_joint".into(),
            },
            Fault::NotBalancing { fsm: Some(1) },
        ]
    }

    #[test]
    fn every_message_is_plain_short_and_free_of_banned_words() {
        for fault in all_faults() {
            let message = fault.message();
            let lower = message.to_lowercase();

            assert!(message.ends_with('.'), "{message}");
            assert!(message.len() < 200, "{message}");
            assert!(BANNED.iter().all(|word| !lower.contains(word)), "{message}");
            assert!(!fault.code().is_empty());
        }
    }

    #[test]
    fn g1_messages_say_the_arms_went_back_to_the_g1() {
        let g1_faults = all_faults().into_iter().filter(|fault| {
            matches!(
                fault,
                Fault::ClientLost
                    | Fault::IntentStale
                    | Fault::IntentNotFinite
                    | Fault::WriteRefused { .. }
                    | Fault::BusGone
                    | Fault::OutOfRange { .. }
                    | Fault::StateLost
                    | Fault::StateCorrupt
                    | Fault::MotorsMissing { .. }
                    | Fault::MotorError { .. }
                    | Fault::NotBalancing { .. }
            )
        });

        for fault in g1_faults {
            let message = fault.g1_message();
            let lower = message.to_lowercase();

            assert!(message.ends_with('.'), "{message}");
            assert!(message.len() < 200, "{message}");
            assert!(BANNED.iter().all(|word| !lower.contains(word)), "{message}");
            assert!(!message.contains("holding still"), "{message}");
        }
    }

    #[test]
    fn losing_the_daemon_explains_what_each_family_does() {
        assert!(daemon_lost_message(Family::Dynamixel).contains("100 ms"));
        assert!(daemon_lost_message(Family::Feetech).contains("holding"));
    }
}

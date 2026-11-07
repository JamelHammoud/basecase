use crate::calibration::RobotClass;
use crate::fault::Fault;

#[derive(Debug, Clone, PartialEq)]
pub enum StopPlan {
    SealNow,
    Hold,
    Stand,
    LowerGain,
    Disable { ids: Vec<u8> },
    DisableAll,
}

pub fn plan_for(fault: &Fault, class: RobotClass) -> StopPlan {
    match fault {
        Fault::BusGone
        | Fault::BusSilent
        | Fault::NoReply { .. }
        | Fault::Garbled { .. }
        | Fault::WrongId { .. }
        | Fault::RepliesLate
        | Fault::DuplicateId { .. }
        | Fault::WrongModel { .. } => StopPlan::SealNow,
        Fault::Overheat { id, .. }
        | Fault::Stall { id, .. }
        | Fault::WrongDirection { id, .. }
        | Fault::ServoProtection { id } => StopPlan::Disable { ids: vec![*id] },
        Fault::Voltage { .. }
        | Fault::UnexpectedTorqueOff { .. }
        | Fault::BusWatchdogTripped { .. }
        | Fault::OutOfRange { .. } => StopPlan::DisableAll,
        Fault::PolicyNotFinite
        | Fault::PolicyStale
        | Fault::IntentNotFinite
        | Fault::IntentStale
        | Fault::ClientLost
        | Fault::WriteRefused { .. } => lost_commands(class),
    }
}

pub fn lost_commands(class: RobotClass) -> StopPlan {
    match class {
        RobotClass::Arm => StopPlan::Hold,
        RobotClass::Legged => StopPlan::Stand,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_arm_that_loses_commands_holds() {
        assert_eq!(plan_for(&Fault::ClientLost, RobotClass::Arm), StopPlan::Hold);
        assert_eq!(plan_for(&Fault::PolicyStale, RobotClass::Arm), StopPlan::Hold);
    }

    #[test]
    fn a_legged_robot_that_loses_commands_stands_still() {
        assert_eq!(plan_for(&Fault::IntentStale, RobotClass::Legged), StopPlan::Stand);
    }

    #[test]
    fn a_hot_or_stuck_servo_is_switched_off_alone() {
        assert_eq!(
            plan_for(&Fault::Overheat { id: 4, temp_c: 51.0 }, RobotClass::Arm),
            StopPlan::Disable { ids: vec![4] }
        );
    }

    #[test]
    fn an_unreliable_bus_gets_no_more_writes() {
        assert_eq!(
            plan_for(&Fault::Garbled { id: 1 }, RobotClass::Legged),
            StopPlan::SealNow
        );
    }
}

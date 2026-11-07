use super::{Daemon, DaemonEvent, Holder, Run};
use crate::caps::{DISABLE_RETRIES, FALL_TORQUE};
use crate::fault::Fault;
use crate::safety::{SafetyLayer, WriteError};
use crate::stop::StopPlan;
use crate::telemetry::Telemetry;

const STAND_TICKS: u32 = 150;

impl Daemon {
    pub(super) fn begin_stop(&mut self, _reason: Option<Fault>, plan: StopPlan) {
        if matches!(self.run, Run::Stopped) || matches!(self.run, Run::Stopping { .. }) {
            return;
        }

        self.stand_ticks = 0;
        self.run = Run::Stopping {
            plan: plan.clone(),
            retries_left: DISABLE_RETRIES,
        };
        self.stopping(plan, DISABLE_RETRIES);
    }

    pub(super) fn stopping(&mut self, plan: StopPlan, retries_left: u32) {
        let telemetry = self.telemetry();
        let stand_pose = self
            .calibration
            .as_ref()
            .and_then(|calibration| calibration.stand_pose.clone());
        let Holder::Armed(layer) = &mut self.holder else {
            self.run = Run::Stopped;

            return;
        };
        let all = layer.ids();
        let step = match plan.clone() {
            StopPlan::SealNow => Step::Seal,
            StopPlan::Hold => hold_all(layer, &all, &telemetry),
            StopPlan::LowerGain => lower_gain(layer, &all, &telemetry),
            StopPlan::Stand => stand(layer, stand_pose.as_deref(), &telemetry, self.stand_ticks),
            StopPlan::Disable { ids } => disable(layer, &ids, &telemetry, retries_left),
            StopPlan::DisableAll => disable(layer, &all, &telemetry, retries_left),
        };

        self.stand_ticks += 1;
        self.finish_step(step, plan, retries_left);
    }

    fn finish_step(&mut self, step: Step, plan: StopPlan, retries_left: u32) {
        match step {
            Step::Again => {
                self.run = Run::Stopping {
                    plan,
                    retries_left: retries_left.saturating_sub(1),
                }
            }
            Step::Seal => self.seal("The robot is holding still. No more motor commands will be sent."),
            Step::SealUnconfirmed => {
                self.seal("A motor did not confirm it switched off. Cut the servo power before touching the robot.")
            }
        }
    }

    fn seal(&mut self, message: &str) {
        if let Holder::Armed(layer) = &mut self.holder {
            layer.seal();
        }

        self.run = Run::Stopped;

        let at_us = self.now_us();

        self.push(DaemonEvent::Stopped {
            at_us,
            message: message.into(),
        });
    }
}

enum Step {
    Again,
    Seal,
    SealUnconfirmed,
}

fn hold_all(layer: &mut SafetyLayer, ids: &[u8], telemetry: &[Option<Telemetry>]) -> Step {
    let _ = layer.hold(ids, telemetry);

    Step::Seal
}

fn lower_gain(layer: &mut SafetyLayer, ids: &[u8], telemetry: &[Option<Telemetry>]) -> Step {
    let lowered = layer.set_torque_fraction(FALL_TORQUE.min(layer.torque_fraction()));

    if lowered.is_ok() {
        let _ = layer.hold(ids, telemetry);
    }

    Step::Seal
}

fn stand(layer: &mut SafetyLayer, pose: Option<&[f32]>, telemetry: &[Option<Telemetry>], ticks: u32) -> Step {
    let Some(pose) = pose else {
        let ids = layer.ids();

        return hold_all(layer, &ids, telemetry);
    };

    if ticks >= STAND_TICKS {
        return Step::Seal;
    }

    let before = layer.goals();

    match layer.command(pose, telemetry) {
        Ok(()) if layer.goals() == before => Step::Seal,
        Ok(()) => Step::Again,
        Err(WriteError::Sealed) => Step::Seal,
        Err(_) => {
            let ids = layer.ids();

            hold_all(layer, &ids, telemetry)
        }
    }
}

fn disable(layer: &mut SafetyLayer, targets: &[u8], telemetry: &[Option<Telemetry>], retries_left: u32) -> Step {
    let still_on: Vec<u8> = targets
        .iter()
        .copied()
        .filter(|id| {
            telemetry
                .iter()
                .flatten()
                .find(|sample| sample.id == *id)
                .is_none_or(|sample| sample.torque_on)
        })
        .collect();
    let rest: Vec<u8> = layer.ids().into_iter().filter(|id| !targets.contains(id)).collect();

    if still_on.is_empty() || retries_left == 0 {
        let _ = layer.hold(&rest, telemetry);

        return if still_on.is_empty() {
            Step::Seal
        } else {
            Step::SealUnconfirmed
        };
    }

    match layer.torque_off(&still_on) {
        Ok(()) => Step::Again,
        Err(_) => Step::SealUnconfirmed,
    }
}

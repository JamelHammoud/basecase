#![cfg(target_os = "macos")]

mod common;

use common::{quadruped, write, Servo, HULL_FOOT};
use forge_ir::Kernel;
use forge_mujoco::Model;
use forge_sim::metal::{admission, Admission};

const SERVO: &str = r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#;

fn robot() -> (Model, Kernel) {
    let path = write(&quadruped(&Servo {
        attrs: SERVO,
        foot: HULL_FOOT,
    }));

    forge_ir::load(&path).expect("the test robot is in the subset")
}

fn fallback(admitted: Admission) -> String {
    match admitted {
        Admission::Metal { device } => panic!("{device} passed qualification with a planted fault"),
        Admission::Mujoco { reason } => {
            println!("{reason}");
            reason
        }
    }
}

#[test]
fn qualification_vectors_admit_this_gpu() {
    let (model, kernel) = robot();

    if let Admission::Mujoco { reason } = admission(&model, &kernel) {
        panic!("{reason}");
    }
}

#[test]
fn qualification_catches_a_perturbed_damping_table_and_falls_back_to_c() {
    let (model, mut kernel) = robot();

    kernel.dofs.iter_mut().for_each(|d| d.damping *= 1.02);

    let why = fallback(admission(&model, &kernel));

    assert!(why.starts_with("Forge's Metal engine can't step this job: "), "{why}");
    assert!(why.contains("failed its qualification vectors"), "{why}");
    assert!(why.contains("off from C MuJoCo"), "{why}");
}

#[test]
fn qualification_catches_a_perturbed_gravity_and_falls_back_to_c() {
    let (model, mut kernel) = robot();

    kernel.options.gravity[2] *= 1.001;

    let why = fallback(admission(&model, &kernel));

    assert!(why.contains("off from C MuJoCo"), "{why}");
}

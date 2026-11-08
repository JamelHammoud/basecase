mod common;

use common::{quadruped, write, Servo, HULL_FOOT};
use forge_mujoco::{Data, Model};
use forge_sim::{Sim, Snapshot};

fn relative(ours: &[f64], theirs: &[f64], floor: f64) -> f64 {
    assert_eq!(ours.len(), theirs.len());

    ours.iter()
        .zip(theirs)
        .map(|(a, b)| (a - b).abs() / b.abs().max(floor))
        .fold(0.0, f64::max)
}

fn reference(model: &Model, qpos: &[f64], qvel: &[f64], ctrl: &[f64]) -> (Snapshot, usize) {
    let mut data = Data::new(model);

    data.qpos().copy_from_slice(qpos);
    data.qvel().copy_from_slice(qvel);
    data.ctrl().copy_from_slice(ctrl);
    data.forward(model);

    let read = |name: &str| {
        data.array(model, name)
            .and_then(|a| a.f64s())
            .map(<[f64]>::to_vec)
            .expect(name)
    };
    let snapshot = Snapshot {
        qpos: qpos.to_vec(),
        qvel: qvel.to_vec(),
        xpos: read("xpos"),
        cinert: read("cinert"),
        qfrc_bias: read("qfrc_bias"),
        qacc: read("qacc"),
        ncon: data.ncon(),
    };

    (snapshot, data.nefc())
}

fn pose(model: &Model, k: usize) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let mut qpos = Data::new(model).qpos().to_vec();
    let qvel: Vec<f64> = (0..model.nv()).map(|i| 0.3 * ((i * 7 + k) as f64).sin()).collect();
    let ctrl: Vec<f64> = (0..model.nu()).map(|i| 0.4 * ((i * 3 + k) as f64).cos()).collect();

    for (i, q) in qpos.iter_mut().enumerate().skip(7) {
        *q += if i % 3 == k % 3 {
            0.9
        } else {
            0.1 * ((i + k) as f64).sin()
        };
    }

    qpos[2] -= 0.004 * k as f64;
    (qpos, qvel, ctrl)
}

#[test]
fn forward_matches_c_mujoco_with_contacts_limits_and_motion() {
    let path = write(&quadruped(&Servo {
        attrs: r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#,
        foot: HULL_FOOT,
    }));
    let (model, kernel) = forge_ir::load(&path).expect("in the subset");
    let mut limits = 0;

    for k in 0..6 {
        let (qpos, qvel, ctrl) = pose(&model, k);
        let (theirs, nefc) = reference(&model, &qpos, &qvel, &ctrl);
        let mut sim = Sim::new(kernel.clone(), 1);

        sim.reset(0, &qpos);
        sim.set_ctrl(0, &ctrl);
        sim.set_qvel(0, &qvel);

        let ours = sim.forward_snapshot(0);

        limits += nefc;
        assert_eq!(ours.ncon, theirs.ncon, "pose {k}: contact count");
        assert!(relative(&ours.xpos, &theirs.xpos, 1e-4) < 5e-12, "pose {k}: xpos");
        assert!(relative(&ours.cinert, &theirs.cinert, 1e-4) < 5e-12, "pose {k}: cinert");
        assert!(
            relative(&ours.qfrc_bias, &theirs.qfrc_bias, 1e-4) < 5e-11,
            "pose {k}: qfrc_bias"
        );
        assert!(relative(&ours.qacc, &theirs.qacc, 1e-1) < 1e-8, "pose {k}: qacc");
    }

    assert!(
        limits > 6 * 8,
        "the poses should press joints into their limits and feet into the floor"
    );
}

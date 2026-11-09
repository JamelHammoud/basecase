use super::setup::{worlds, Start};
use super::task::lower;
use crate::job::parse;
use crate::kernels::Math;
use crate::robot::Robot;
use forge_mujoco::Model;
use forge_sim::metal::gpu::{BufferId, Gpu};
use forge_sim::metal::{Outputs, Worlds};
use serde_json::{json, Value};
use std::fs;

const ENVS: usize = 8;
const SCALE: f64 = 0.25;
const ENCODER_BIAS: f32 = 0.02;
const IMU_BIAS: f32 = 0.03;

const MODEL: &str = r#"<mujoco model="tiny">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    <body name="base" pos="0 0 0.12">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6" contype="1" conaffinity="0"/>
      <body pos="0.06 0 0">
        <joint name="front" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05" contype="1" conaffinity="0"/>
      </body>
      <body pos="-0.06 0 0">
        <joint name="back" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05" contype="1" conaffinity="0"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="front" joint="front" kp="3" ctrlrange="-1 1"/>
    <position name="back" joint="back" kp="3" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"#;

fn robot(name: &str, conditions: &Value) -> Robot {
    let folder = std::env::temp_dir().join(format!("forge-gpu-conditions-{name}"));
    let mut job = json!({
        "task": "walk", "minutes": 1, "command": [0.2, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": SCALE, "controlDt": 0.02, "envs": ENVS,
        "seed": 5, "backend": "metal"
    });

    job.as_object_mut()
        .expect("object")
        .extend(conditions.as_object().expect("object").clone());
    fs::create_dir_all(&folder).expect("folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");

    let model = Model::load(&folder.join("model.xml")).expect("model loads");

    Robot::load(model, parse(&job).expect("job parses")).expect("robot loads")
}

struct Bench {
    gpu: Gpu,
    worlds: Worlds,
    actions: BufferId<f32>,
    outputs: Outputs,
}

fn bench(robot: &Robot) -> Bench {
    let task = lower(robot).expect("the GPU loop takes these conditions");
    let start = Start {
        robot,
        envs: ENVS,
        env_seed: 11,
        seed: 12,
        math: Math::native(1),
    };
    let (mut gpu, worlds, _) = worlds(&start, &task).expect("worlds");
    let actions = gpu.alloc::<f32>(ENVS * robot.nact).expect("actions");
    let mut buffer = || gpu.alloc::<f32>(ENVS).expect("output");
    let outputs = Outputs {
        rew: buffer(),
        done: buffer(),
        timeout: buffer(),
        fell: buffer(),
    };

    gpu.run(&[worlds.reset_all()]).expect("reset");

    Bench {
        gpu,
        worlds,
        actions,
        outputs,
    }
}

impl Bench {
    fn step(&mut self, action: f32) {
        self.gpu.slice_mut(self.actions).fill(action);

        let w = &self.worlds;
        let dispatches = [w.act(self.actions, 0), w.physics(), w.after(&self.outputs, 0)];

        self.gpu.run(&dispatches).expect("step");
    }

    fn act_only(&mut self, action: f32) -> f64 {
        self.gpu.slice_mut(self.actions).fill(action);
        self.gpu.run(&[self.worlds.act(self.actions, 0)]).expect("act");
        self.worlds.read(&self.gpu, 0, "CTRL")[0]
    }

    fn observe(&mut self) -> Vec<f32> {
        self.gpu.run(&[self.worlds.observe()]).expect("observe");
        self.gpu.slice(self.worlds.obs()).to_vec()
    }
}

#[test]
fn delayed_servos_replay_older_actions_on_the_gpu() {
    let mut b = bench(&robot("delay", &json!({ "delaySteps": [2, 2] })));
    let seen: Vec<f64> = (1..=4).map(|k| b.act_only(k as f32 * 0.2) / SCALE).collect();

    for (got, want) in seen.iter().zip([0.0, 0.0, 0.2, 0.4]) {
        assert!((got - want).abs() < 1e-6, "{seen:?}");
    }
}

#[test]
fn each_robot_draws_its_own_command_and_redraws_it() {
    let commands = json!({ "commands": {
        "ranges": [[0.1, 0.3], [-0.05, 0.05], [-0.5, 0.5]], "resampleS": [0.04, 0.06], "stillShare": 0
    }});
    let mut b = bench(&robot("commands", &commands));
    let nobs = b.worlds.nobs;
    let first = b.observe();
    let drawn: Vec<[f32; 3]> = (0..ENVS)
        .map(|w| [first[w * nobs + 9], first[w * nobs + 10], first[w * nobs + 11]])
        .collect();

    assert!(drawn
        .iter()
        .all(|c| (0.1..=0.3).contains(&c[0]) && c[1].abs() <= 0.05 && c[2].abs() <= 0.5));
    assert!(drawn.windows(2).any(|p| p[0] != p[1]), "{drawn:?}");

    for _ in 0..4 {
        b.step(0.0);
    }

    let later = b.observe();

    assert!(
        (0..ENVS).all(|w| later[w * nobs + 9..w * nobs + 12] != first[w * nobs + 9..w * nobs + 12]),
        "every command is redrawn within 3 control steps"
    );
}

#[test]
fn encoder_and_imu_biases_reach_only_the_observation() {
    let biased = json!({ "encoderBias": ENCODER_BIAS, "imuBias": IMU_BIAS });
    let mut clean = bench(&robot("clean", &json!({})));
    let mut skewed = bench(&robot("biased", &biased));
    let nobs = clean.worlds.nobs;
    let (truth, seen) = (clean.observe(), skewed.observe());

    for w in 0..ENVS {
        let at = w * nobs;
        let offsets: Vec<f32> = (12..14).map(|i| seen[at + i] - truth[at + i]).collect();
        let tilt = (0..3)
            .map(|k| (seen[at + k] - truth[at + k]).powi(2))
            .sum::<f32>()
            .sqrt();
        let length = (0..3).map(|k| seen[at + k].powi(2)).sum::<f32>().sqrt();

        assert!(
            offsets.iter().all(|o| o.abs() <= ENCODER_BIAS && *o != 0.0),
            "{offsets:?}"
        );
        assert!(tilt > 0.0 && tilt <= 2.0 * IMU_BIAS, "{tilt}");
        assert!((length - 1.0).abs() < 1e-5);
        assert_eq!(seen[at + 3..at + 12], truth[at + 3..at + 12]);
    }

    skewed.step(0.0);
    clean.step(0.0);

    let (truth, seen) = (clean.observe(), skewed.observe());

    assert!((0..ENVS).all(|w| (seen[w * nobs + 12] - truth[w * nobs + 12]).abs() <= ENCODER_BIAS));
}

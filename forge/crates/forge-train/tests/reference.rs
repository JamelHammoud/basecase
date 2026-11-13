use forge_mujoco::Model;
use forge_train::envs::{Envs, StepResult};
use forge_train::events::Phases;
use forge_train::job;
use forge_train::robot::Robot;
use serde_json::{json, Value};
use std::f64::consts::{PI, TAU};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const MODEL: &str = r#"<mujoco model="tiny">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05"/>
    <body name="base" pos="0 0 0.12">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6"/>
      <body pos="0.06 0 0">
        <joint name="front" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
      <body pos="-0.06 0 0">
        <joint name="back" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="front" joint="front" kp="3" ctrlrange="-1 1"/>
    <position name="back" joint="back" kp="3" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"#;

const FOLLOW: &str = r#"
def reward(state):
    pose = exp(-8.0 * sum(square(state.reference[:2] - state.joint_pos)))
    return term("pose", pose) + term("height", 0.1 * exp(-50.0 * square(state.reference[2] - state.z)))
"#;

const FIRST: &str = "def reward(state):\n    return state.reference[0] + 10.0 * state.reference[3]\n";
const FRAMES: usize = 40;
const SCALE: f64 = 0.25;

fn swaying(frames: usize) -> Vec<[f64; 4]> {
    (0..frames)
        .map(|k| {
            let phase = TAU * k as f64 / frames as f64;

            [0.2 * phase.sin(), -0.2 * phase.sin(), 0.12, 0.01 * k as f64]
        })
        .collect()
}

fn folder(name: &str, extra: &Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let mut job = json!({
        "task": "walk", "minutes": 5, "command": [0.2, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": SCALE, "controlDt": 0.02, "envs": 8, "maxIterations": 3,
        "seed": 4, "pushes": false, "fallResets": false, "reward": FOLLOW
    });

    job.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());

    let _ = fs::remove_dir_all(&folder);

    fs::create_dir_all(&folder).expect("job folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");
    fs::write(folder.join("job.json"), job.to_string()).expect("job");
    folder
}

fn robot(name: &str, extra: &Value) -> Robot {
    let dir = folder(name, extra);
    let model = Model::load(&dir.join("model.xml")).expect("loads");

    Robot::load(model, job::load(&dir).expect("job")).expect("robot")
}

fn read(folder: &Path, file: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(folder.join(file)).expect(file)).expect("json")
}

fn clock(k: usize, looping: bool) -> [f64; 2] {
    let angle = if looping {
        TAU * (k % FRAMES) as f64 / FRAMES as f64
    } else {
        PI * k.min(FRAMES - 1) as f64 / (FRAMES - 1) as f64
    };

    [angle.sin(), angle.cos()]
}

fn assert_clock(obs: &[f32], k: usize, looping: bool) {
    let want = clock(k, looping);
    let got = &obs[obs.len() - 2..];

    assert!(
        (f64::from(got[0]) - want[0]).abs() < 1e-6 && (f64::from(got[1]) - want[1]).abs() < 1e-6,
        "step {k}: clock {got:?} against {want:?}"
    );
}

struct Stepper<'a> {
    envs: Envs<'a>,
    obs: Vec<f32>,
    reward: Vec<f32>,
    fell: Vec<bool>,
    timeout: Vec<bool>,
}

impl<'a> Stepper<'a> {
    fn new(robot: &'a Robot) -> Self {
        Self {
            envs: Envs::new(robot, 1, 3, false).expect("envs"),
            obs: vec![0.0; robot.nobs()],
            reward: vec![0.0],
            fell: vec![false],
            timeout: vec![false],
        }
    }

    fn observe(&mut self) -> &[f32] {
        self.envs.observe(&mut self.obs);
        &self.obs
    }

    fn step(&mut self, actions: &[f32]) -> f64 {
        let result = StepResult {
            reward: &mut self.reward,
            fell: &mut self.fell,
            timeout: &mut self.timeout,
        };

        self.envs.step(actions, result, &mut Phases::default()).expect("steps");
        f64::from(self.reward[0])
    }
}

#[test]
fn a_reference_job_trains_and_exports_its_clock() {
    let reference = json!({ "loop": true, "frames": swaying(FRAMES) });
    let dir = folder("reference-train", &json!({ "reference": reference }));
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&dir)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let policy = read(&dir, "policy.json");
    let samples = read(&dir, "policy-check.json")["samples"]
        .as_array()
        .expect("samples")
        .clone();
    let control_dt = 10.0 * 0.002;
    let stride = ((8.0 / control_dt) as usize / samples.len()).max(1);

    assert_eq!(policy["clock"], json!({ "frames": FRAMES, "loop": true }));
    assert_eq!(policy["layers"][0]["in"], 12 + 3 * 2 + 2);
    assert_eq!(policy["obsMean"].as_array().expect("mean").len(), 20);

    for (i, sample) in samples.iter().enumerate() {
        let obs: Vec<f32> = sample["obs"]
            .as_array()
            .expect("obs")
            .iter()
            .map(|v| v.as_f64().expect("number") as f32)
            .collect();

        assert_eq!(obs.len(), 20);
        assert_clock(&obs, i * stride, true);
    }
}

#[test]
fn a_job_without_a_reference_exports_no_clock() {
    let dir = folder(
        "reference-none",
        &json!({ "reward": "def reward(state):\n    return state.z\n" }),
    );
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&dir)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let policy = read(&dir, "policy.json");

    assert!(policy.get("clock").is_none());
    assert_eq!(policy["layers"][0]["in"], 12 + 3 * 2);
}

#[test]
fn shac_refuses_a_reference_job() {
    let reference = json!({ "loop": true, "frames": swaying(FRAMES) });
    let dir = folder(
        "reference-shac",
        &json!({ "reference": reference, "algo": "shac", "backend": "simd" }),
    );
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&dir)
        .output()
        .expect("runs");
    let message = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(
        message.contains("SHAC can't train this job: it follows a motion reference"),
        "{message}"
    );
}

#[test]
fn the_clock_follows_the_steps_and_restarts_with_each_episode() {
    let reference = json!({ "loop": true, "frames": swaying(FRAMES) });
    let robot = robot(
        "reference-clock",
        &json!({ "reference": reference, "reward": FIRST, "episodeS": 1.0 }),
    );
    let frames = swaying(FRAMES);
    let episode = robot.episode_steps as usize;
    let mut stepper = Stepper::new(&robot);

    stepper.envs.keep_final_obs();

    for k in 0..episode + 5 {
        let at = k % episode;

        assert_clock(stepper.observe(), at, true);

        let reward = stepper.step(&[0.0, 0.0]);
        let frame = frames[(at + 1) % FRAMES];

        assert!(
            (reward - (frame[0] + 10.0 * frame[3])).abs() < 1e-5,
            "step {k}: {reward}"
        );
    }

    assert_clock(stepper.envs.final_obs(), episode, true);
}

#[test]
fn a_one_shot_reference_holds_its_last_frame() {
    let reference = json!({ "loop": false, "frames": swaying(FRAMES) });
    let robot = robot("reference-once", &json!({ "reference": reference, "reward": FIRST }));
    let last = swaying(FRAMES)[FRAMES - 1];
    let mut stepper = Stepper::new(&robot);

    for k in 0..FRAMES + 10 {
        assert_clock(stepper.observe(), k, false);

        let reward = stepper.step(&[0.0, 0.0]);

        if k + 1 >= FRAMES - 1 {
            assert!((reward - (last[0] + 10.0 * last[3])).abs() < 1e-5, "step {k}: {reward}");
        }
    }

    assert_clock(stepper.observe(), FRAMES - 1, false);
}

fn earned(robot: &Robot, sign: f64) -> f64 {
    let frames = swaying(FRAMES);
    let mut stepper = Stepper::new(robot);

    (0..2 * FRAMES)
        .map(|k| {
            let target = frames[(k + 1) % FRAMES];
            let action = [sign * target[0] / SCALE, sign * target[1] / SCALE].map(|a| a as f32);

            stepper.step(&action)
        })
        .sum()
}

#[test]
fn matching_the_reference_earns_more_than_missing_it() {
    let reference = json!({ "loop": true, "frames": swaying(FRAMES) });
    let robot = robot("reference-match", &json!({ "reference": reference }));
    let (matched, mirrored, still) = (earned(&robot, 1.0), earned(&robot, -1.0), earned(&robot, 0.0));

    assert!(matched > still && still > mirrored, "{matched} {still} {mirrored}");
}

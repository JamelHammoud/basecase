use crate::deployed::Squash;
use crate::eyes::{self, EyeSpec};
use crate::options::{self, TaskOptions};
use crate::start_states;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct JointSpec {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Task {
    Stand,
    Walk,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Algo {
    Ppo,
    FastSac,
    FlashSac,
    Shac,
    Bc,
}

impl Algo {
    fn parse(name: Option<&str>) -> Result<Self, String> {
        match name {
            None | Some("ppo") => Ok(Algo::Ppo),
            Some("fastsac") => Ok(Algo::FastSac),
            Some("flashsac") => Ok(Algo::FlashSac),
            Some("shac") => Ok(Algo::Shac),
            Some("bc") => Ok(Algo::Bc),
            Some(other) => Err(format!("job.json asks for an unknown algo {other}")),
        }
    }

    fn default_envs(self) -> usize {
        match self {
            Algo::Ppo | Algo::Shac | Algo::Bc => 64,
            Algo::FastSac | Algo::FlashSac => 256,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    Mujoco,
    Simd,
    Metal,
    Wgpu,
}

impl Backend {
    fn parse(name: Option<&str>) -> Result<Self, String> {
        match name {
            None | Some("mujoco") => Ok(Backend::Mujoco),
            Some("simd") => Ok(Backend::Simd),
            Some("metal") => Ok(Backend::Metal),
            Some("wgpu") => Ok(Backend::Wgpu),
            Some(other) => Err(format!("job.json asks for an unknown backend {other}")),
        }
    }
}

fn squash(name: Option<&str>) -> Result<Squash, String> {
    match name {
        None | Some("clip") => Ok(Squash::Clip),
        Some("tanh") => Ok(Squash::Tanh),
        Some(other) => Err(format!("job.json asks for an unknown squash {other}")),
    }
}

#[derive(Clone, Debug)]
pub struct Job {
    pub algo: Algo,
    pub backend: Backend,
    pub task: Task,
    pub task_name: String,
    pub robot_name: String,
    pub minutes: f64,
    pub command: [f64; 3],
    pub root: String,
    pub joints: Vec<JointSpec>,
    pub default_pose: Vec<f64>,
    pub ctrl_default: Vec<f64>,
    pub initial_joints: Vec<(String, f64)>,
    pub root_offset: [f64; 3],
    pub action_scale: f64,
    pub control_dt: f64,
    pub seed: u64,
    pub max_iterations: Option<usize>,
    pub gate_every: Option<usize>,
    pub eval_seeds: Option<usize>,
    pub gate_speed: f64,
    pub envs: usize,
    pub gpu_envs: Option<usize>,
    pub threads: Option<usize>,
    pub warm_start: Option<PathBuf>,
    pub log_std_min: Option<f32>,
    pub squash: Squash,
    pub options: TaskOptions,
    pub eyes: Vec<EyeSpec>,
    pub eyes_json: Option<Value>,
    pub demos: Option<String>,
    pub state_noise: f32,
}

fn required<'a>(root: &'a Value, key: &str) -> Result<&'a Value, String> {
    root.get(key).ok_or_else(|| format!("job.json is missing {key}"))
}

fn number(root: &Value, key: &str) -> Result<f64, String> {
    required(root, key)?
        .as_f64()
        .ok_or_else(|| format!("job.json has a non-number {key}"))
}

fn text(root: &Value, key: &str) -> Result<String, String> {
    let value = required(root, key)?;

    value
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("job.json has a non-text {key}"))
}

fn numbers(root: &Value, key: &str) -> Result<Vec<f64>, String> {
    let list = required(root, key)?
        .as_array()
        .ok_or_else(|| format!("job.json has a non-list {key}"))?;

    list.iter()
        .map(|v| v.as_f64().ok_or_else(|| format!("job.json has a non-number in {key}")))
        .collect()
}

fn triple(root: &Value, key: &str) -> Result<[f64; 3], String> {
    let list = numbers(root, key)?;

    list.try_into()
        .map_err(|_| format!("job.json needs three numbers in {key}"))
}

fn optional_count(root: &Value, key: &str) -> Option<usize> {
    root.get(key).and_then(Value::as_u64).map(|v| v as usize)
}

fn warm_start(root: &Value) -> Result<Option<PathBuf>, String> {
    match root.get("warmStart") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(path)) if !path.trim().is_empty() => Ok(Some(PathBuf::from(path))),
        Some(_) => Err("job.json needs a path in warmStart".to_owned()),
    }
}

fn plain_file_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

fn demos(root: &Value, algo: Algo) -> Result<Option<String>, String> {
    let name = match root.get("demos") {
        None | Some(Value::Null) => None,
        Some(Value::String(name)) => Some(name.clone()),
        Some(_) => return Err("job.json needs a file name in demos".to_owned()),
    };

    match (algo, name) {
        (Algo::Bc, None) => Err("job.json trains from demos but names no demos file".to_owned()),
        (_, Some(name)) if !plain_file_name(&name) => {
            Err(format!("demos must be a file in the job folder, not {name}"))
        }
        (_, name) => Ok(name),
    }
}

const MAX_STATE_NOISE: f64 = 5.0;

fn state_noise(root: &Value) -> Result<f32, String> {
    match root.get("stateNoise") {
        None | Some(Value::Null) => Ok(0.0),
        Some(value) => value
            .as_f64()
            .filter(|v| (0.0..=MAX_STATE_NOISE).contains(v))
            .map(|v| v as f32)
            .ok_or_else(|| format!("job.json's stateNoise must be from 0 to {MAX_STATE_NOISE}")),
    }
}

fn check_cloning(job: &Job) -> Result<(), String> {
    if job.algo != Algo::Bc {
        return Ok(());
    }

    if job.sees() || job.options.reference.is_some() {
        return Err("Training from demos takes no eyes and no reference".to_owned());
    }

    Ok(())
}

fn joints(root: &Value) -> Result<Vec<JointSpec>, String> {
    let list = required(root, "joints")?
        .as_array()
        .ok_or("job.json has a non-list joints")?;

    list.iter()
        .map(|j| {
            Ok(JointSpec {
                id: text(j, "id")?,
                name: text(j, "name")?,
            })
        })
        .collect()
}

fn initial_joints(root: &Value) -> Result<Vec<(String, f64)>, String> {
    let map = required(root, "initialJoints")?
        .as_object()
        .ok_or("job.json has a non-object initialJoints")?;

    map.iter()
        .map(|(name, value)| {
            let angle = value
                .as_f64()
                .ok_or_else(|| format!("initialJoints has a non-number {name}"))?;

            Ok((name.clone(), angle))
        })
        .collect()
}

pub fn parse(root: &Value) -> Result<Job, String> {
    let task_name = text(root, "task")?;
    let task = if task_name == "stand" { Task::Stand } else { Task::Walk };
    let algo = Algo::parse(root.get("algo").and_then(Value::as_str))?;
    let joints = joints(root)?;
    let options = options::parse(root)?;

    options::check_reference(&options, joints.len())?;
    start_states::check(&options.start_states, joints.len())?;

    let job = Job {
        algo,
        backend: Backend::parse(root.get("backend").and_then(Value::as_str))?,
        task,
        task_name,
        robot_name: root
            .get("robotName")
            .and_then(Value::as_str)
            .unwrap_or("Robot")
            .to_owned(),
        minutes: number(root, "minutes")?,
        command: triple(root, "command")?,
        root: text(root, "root")?,
        joints,
        default_pose: numbers(root, "defaultPose")?,
        ctrl_default: numbers(root, "ctrlDefault")?,
        initial_joints: initial_joints(root)?,
        root_offset: triple(root, "rootOffset")?,
        action_scale: number(root, "actionScale")?,
        control_dt: number(root, "controlDt")?,
        seed: root.get("seed").and_then(Value::as_u64).unwrap_or(0),
        max_iterations: optional_count(root, "maxIterations"),
        gate_every: optional_count(root, "gateEvery"),
        eval_seeds: optional_count(root, "evalSeeds"),
        gate_speed: root.get("gateSpeed").and_then(Value::as_f64).unwrap_or(0.2),
        envs: optional_count(root, "envs").unwrap_or(algo.default_envs()),
        gpu_envs: optional_count(root, "gpuEnvs"),
        threads: optional_count(root, "threads"),
        warm_start: warm_start(root)?,
        log_std_min: root
            .get("logStdMin")
            .and_then(Value::as_f64)
            .map(|v| v as f32)
            .filter(|v| v.is_finite()),
        squash: squash(root.get("squash").and_then(Value::as_str))?,
        options,
        eyes: eyes::parse(root)?,
        eyes_json: root
            .get("eyes")
            .filter(|v| v.as_array().is_some_and(|l| !l.is_empty()))
            .cloned(),
        demos: demos(root, algo)?,
        state_noise: state_noise(root)?,
    };

    check_cloning(&job)?;

    Ok(job)
}

impl Job {
    pub fn sees(&self) -> bool {
        !self.eyes.is_empty()
    }

    pub fn clock_width(&self) -> usize {
        2 * usize::from(self.options.reference.is_some())
    }

    pub fn envs_on_gpu(&self) -> usize {
        self.gpu_envs.unwrap_or(self.envs)
    }
}

pub fn load(folder: &Path) -> Result<Job, String> {
    let path = folder.join("job.json");
    let text = fs::read_to_string(&path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
    let root: Value = serde_json::from_str(&text).map_err(|e| format!("Couldn't parse job.json: {e}"))?;

    parse(&root)
}

#[cfg(test)]
mod tests {
    use super::{parse, Squash};
    use serde_json::json;

    fn sample() -> serde_json::Value {
        json!({
            "task": "stand", "minutes": 1, "command": [0, 0, 0], "root": "r", "robotName": "Robot",
            "joints": [{"id": "a", "name": "j0"}], "defaultPose": [0.1], "ctrlDefault": [0.0],
            "initialJoints": {"j0": 0.2}, "rootOffset": [0, 0, 0.1], "actionScale": 0.25, "controlDt": 0.02
        })
    }

    #[test]
    fn reads_a_minimal_job() {
        let job = parse(&sample()).expect("job parses");

        assert_eq!(job.envs, 64);
        assert_eq!(job.joints[0].name, "j0");
        assert_eq!(job.initial_joints, vec![("j0".to_owned(), 0.2)]);
        assert_eq!(job.gate_speed, 0.2);
        assert_eq!(job.algo, super::Algo::Ppo);
        assert_eq!(job.backend, super::Backend::Mujoco);
        assert_eq!(job.warm_start, None);
    }

    #[test]
    fn reads_the_physics_backend() {
        let mut job = sample();

        job["backend"] = json!("simd");
        assert_eq!(parse(&job).expect("job parses").backend, super::Backend::Simd);
        job["backend"] = json!("gpu");
        assert!(parse(&job).expect_err("must fail").contains("backend"));
    }

    #[test]
    fn a_gpu_loop_job_can_ask_for_more_robots_than_its_cpu_fallback() {
        let mut job = sample();

        assert_eq!(parse(&job).expect("job parses").envs_on_gpu(), 64);
        job["gpuEnvs"] = json!(4096);

        let parsed = parse(&job).expect("job parses");

        assert_eq!((parsed.envs, parsed.envs_on_gpu()), (64, 4096));
    }

    #[test]
    fn reads_the_action_squash() {
        let mut job = sample();

        assert_eq!(parse(&job).expect("job parses").squash, Squash::Clip);
        job["squash"] = json!("tanh");
        assert_eq!(parse(&job).expect("job parses").squash, Squash::Tanh);
        job["squash"] = json!("sigmoid");
        assert!(parse(&job).expect_err("must fail").contains("squash"));
    }

    #[test]
    fn reads_a_warm_start_path() {
        let mut job = sample();

        job["warmStart"] = json!("../run-1");
        assert_eq!(
            parse(&job).expect("job parses").warm_start,
            Some(std::path::PathBuf::from("../run-1"))
        );
        job["warmStart"] = json!(3);
        assert!(parse(&job).expect_err("must fail").contains("warmStart"));
    }

    #[test]
    fn reads_the_off_policy_algorithms() {
        let mut job = sample();

        job["algo"] = json!("flashsac");
        assert_eq!(parse(&job).expect("job parses").algo, super::Algo::FlashSac);
        job["algo"] = json!("bc");
        job["demos"] = json!("demos.json");
        assert_eq!(parse(&job).expect("job parses").algo, super::Algo::Bc);
        job["algo"] = json!("dqn");
        assert!(parse(&job).expect_err("must fail").contains("dqn"));
    }

    #[test]
    fn a_reference_needs_two_numbers_past_the_joints() {
        let mut job = sample();

        job["reference"] = json!({ "loop": false, "frames": [[0.1, 0.12, 0], [0.2, 0.12, 0]] });
        assert_eq!(parse(&job).expect("job parses").clock_width(), 2);
        job["reference"] = json!({ "loop": false, "frames": [[0.1, 0.12], [0.2, 0.12]] });
        assert!(parse(&job)
            .expect_err("must fail")
            .contains("reference frames need 3 numbers"));
    }

    #[test]
    fn missing_field_names_the_field() {
        let mut broken = sample();

        broken.as_object_mut().expect("object").remove("root");

        assert!(parse(&broken).expect_err("must fail").contains("root"));
    }
}

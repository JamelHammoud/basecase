use forge_reward::code::{Input, Op};
use forge_reward::{compile, compile_for, Program, RewardState, Schema};

const JOINTS: usize = 3;
const WIDTH: usize = JOINTS + 2;
const STATES: usize = 300;

const FOLLOW: &str = r#"
def reward(state):
    pose = exp(-4.0 * sum(square(state.reference[:3] - state.joint_pos)))
    height = exp(-50.0 * square(state.reference[3] - state.z))
    tilt = abs(state.reference[-1])
    return term("pose", pose) + term("height", height) - term("tilt", tilt) * 0.1
"#;

const SCHEMA: Schema = Schema {
    joints: JOINTS,
    bodies: 0,
};

struct Draw(u64);

impl Draw {
    fn within(&mut self, low: f64, high: f64) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);

        low + (high - low) * ((self.0 >> 11) as f64 / (1u64 << 53) as f64)
    }

    fn many<const N: usize>(&mut self, spread: f64) -> [f64; N] {
        std::array::from_fn(|_| self.within(-spread, spread))
    }
}

struct Owned {
    z: f64,
    joints: [[f64; JOINTS]; 4],
    reference: [f64; WIDTH],
}

impl Owned {
    fn random(draw: &mut Draw) -> Self {
        Self {
            z: draw.within(0.02, 0.2),
            joints: [draw.many(0.8), draw.many(6.0), draw.many(1.0), draw.many(1.0)],
            reference: draw.many(0.8),
        }
    }

    fn view(&self) -> RewardState<'_> {
        RewardState {
            gravity: [0.0, 0.0, -1.0],
            angvel: [0.0; 3],
            linvel: [0.0; 3],
            command: [0.0; 3],
            z: self.z,
            z0: 0.13,
            control_dt: 0.02,
            joint_pos: &self.joints[0],
            joint_vel: &self.joints[1],
            action: &self.joints[2],
            last_action: &self.joints[3],
            bodies: &[],
        }
    }

    fn read(&self, input: Input) -> f64 {
        match input {
            Input::Gravity(k) => [0.0, 0.0, -1.0][k],
            Input::Z => self.z,
            Input::Z0 => 0.13,
            Input::ControlDt => 0.02,
            Input::JointPos(j) => self.joints[0][j],
            Input::JointVel(j) => self.joints[1][j],
            Input::Action(j) => self.joints[2][j],
            Input::LastAction(j) => self.joints[3][j],
            Input::Reference(k) => self.reference[k],
            Input::AngVel(_) | Input::LinVel(_) | Input::Command(_) => 0.0,
        }
    }
}

fn following(source: &str) -> Result<Program, String> {
    compile_for(source, SCHEMA, true)
}

#[test]
fn the_reference_interprets_and_lowers_to_the_same_reward() {
    let program = following(FOLLOW).expect("compiles");
    let code = program.lower().expect("lowers");
    let mut draw = Draw(17);

    for _ in 0..STATES {
        let owned = Owned::random(&mut draw);
        let expected = program.evaluate_with_reference(&owned.view(), &owned.reference).total;
        let got = code.evaluate(|input| owned.read(input));

        assert!(
            (got - expected).abs() <= 1e-12 * expected.abs().max(1.0),
            "{got} against {expected}"
        );
    }
}

#[test]
fn matching_the_reference_scores_higher() {
    let program = following(FOLLOW).expect("compiles");
    let mut owned = Owned::random(&mut Draw(3));
    let missed = program.evaluate_with_reference(&owned.view(), &owned.reference).total;

    owned.joints[0].copy_from_slice(&owned.reference[..JOINTS]);
    owned.z = owned.reference[JOINTS];

    let matched = program.evaluate_with_reference(&owned.view(), &owned.reference).total;

    assert!(matched > missed, "{matched} against {missed}");
}

#[test]
fn the_reference_is_two_longer_than_the_joints_and_lowers_to_its_own_reads() {
    let code = following(FOLLOW).expect("compiles").lower().expect("lowers");
    let read: Vec<usize> = code
        .ops
        .iter()
        .filter_map(|op| match op {
            Op::Read(Input::Reference(k)) => Some(*k),
            _ => None,
        })
        .collect();

    assert_eq!(read.iter().max(), Some(&(WIDTH - 1)));
    assert!((0..WIDTH).all(|k| read.contains(&k)));
    assert!(following("def reward(state):\n    return state.reference[5]\n")
        .expect_err("index 5 is past the reference")
        .contains("length 5"));
}

#[test]
fn reading_the_reference_without_one_is_refused() {
    let refused = compile(FOLLOW, SCHEMA).expect_err("the job has no reference");

    assert!(
        refused.contains("Line 3: state.reference needs a job with a reference"),
        "{refused}"
    );
    assert!(compile("def reward(state):\n    return state.z\n", SCHEMA).is_ok());
}

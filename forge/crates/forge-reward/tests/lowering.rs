use forge_reward::code::Input;
use forge_reward::{compile, programs, Program, RewardState, Schema};

const JOINTS: usize = 6;
const STATES: usize = 400;

const EVERYTHING: &str = r#"
def helper(v, k):
    return clamp(v * k, -0.5, 0.5)

def reward(state):
    a = sum(abs(state.joint_pos)) + mean(state.joint_vel ** 2) - max(state.action) + min(state.last_action)
    b = norm(state.linvel) + dot(state.gravity, state.angvel) + safe_div(state.z, state.command[0])
    c = log(state.z) + sqrt(state.z0) + tanh(state.angvel[2]) + sin(state.command[1]) * cos(state.command[2])
    d = 1.0 if state.z > 0.1 and not state.z0 < 0.05 or state.command[0] == 0 else -1.0
    e = sum(helper(state.action - state.last_action, 2.0)) + square(state.control_dt) / max(state.z, 0.05)
    return term("a", a) + term("b", b) - term("c", c) * 0.5 + term("d", d) + term("e", e) + exp(-state.z ** 2)
"#;

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
    vectors: [[f64; 3]; 4],
    z: f64,
    joints: [[f64; JOINTS]; 4],
}

impl Owned {
    fn random(draw: &mut Draw) -> Self {
        let mut command = draw.many::<3>(0.3);

        if draw.within(0.0, 1.0) < 0.2 {
            command[0] = 0.0;
        }

        Self {
            vectors: [draw.many(1.0), draw.many(3.0), draw.many(1.0), command],
            z: draw.within(0.02, 0.2),
            joints: [draw.many(0.8), draw.many(6.0), draw.many(1.0), draw.many(1.0)],
        }
    }

    fn view(&self) -> RewardState<'_> {
        RewardState {
            gravity: self.vectors[0],
            angvel: self.vectors[1],
            linvel: self.vectors[2],
            command: self.vectors[3],
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
            Input::Gravity(k) => self.vectors[0][k],
            Input::AngVel(k) => self.vectors[1][k],
            Input::LinVel(k) => self.vectors[2][k],
            Input::Command(k) => self.vectors[3][k],
            Input::Z => self.z,
            Input::Z0 => 0.13,
            Input::ControlDt => 0.02,
            Input::JointPos(j) => self.joints[0][j],
            Input::JointVel(j) => self.joints[1][j],
            Input::Action(j) => self.joints[2][j],
            Input::LastAction(j) => self.joints[3][j],
        }
    }
}

fn program(source: &str) -> Program {
    compile(
        source,
        Schema {
            joints: JOINTS,
            bodies: 0,
        },
    )
    .expect("the program compiles")
}

fn check_lowered_matches(source: &str) {
    let program = program(source);
    let code = program.lower().expect("the program lowers");
    let mut draw = Draw(11);

    assert_eq!(code.terms.len(), program.terms.len());

    for _ in 0..STATES {
        let owned = Owned::random(&mut draw);
        let expected = program.evaluate(&owned.view()).total;
        let got = code.evaluate(|input| owned.read(input));

        assert!(
            (got - expected).abs() <= 1e-12 * expected.abs().max(1.0),
            "{got} against {expected}"
        );
    }
}

#[test]
fn lowered_rewards_match_the_interpreter() {
    check_lowered_matches(&programs::walk());
    check_lowered_matches(&programs::stand());
    check_lowered_matches(&programs::fell());
    check_lowered_matches(EVERYTHING);
}

#[test]
fn bodies_are_refused_with_a_reason() {
    let source = "def reward(state):\n    return sum(b.z for b in state.bodies)\n";
    let program = compile(
        source,
        Schema {
            joints: JOINTS,
            bodies: 2,
        },
    )
    .expect("the program compiles");

    assert!(program
        .lower()
        .expect_err("bodies aren't lowered")
        .contains("state.bodies"));
}

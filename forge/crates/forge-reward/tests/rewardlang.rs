use forge_reward::{compile, handwritten, programs, BodyState, Program, RewardState, Schema};

const JOINTS: usize = 12;
const STATES: usize = 500;

struct Draw(u64);

impl Draw {
    fn unit(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);

        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    fn within(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.unit()
    }

    fn many(&mut self, n: usize, spread: f64) -> Vec<f64> {
        (0..n).map(|_| self.within(-spread, spread)).collect()
    }

    fn triple(&mut self, spread: f64) -> [f64; 3] {
        [
            self.within(-spread, spread),
            self.within(-spread, spread),
            self.within(-spread, spread),
        ]
    }
}

struct Owned {
    gravity: [f64; 3],
    angvel: [f64; 3],
    linvel: [f64; 3],
    command: [f64; 3],
    z: f64,
    joints: [Vec<f64>; 4],
    bodies: Vec<BodyState>,
}

impl Owned {
    fn random(draw: &mut Draw) -> Self {
        let tilt = draw.triple(0.6);
        let length = (tilt[0] * tilt[0] + tilt[1] * tilt[1] + 1.0).sqrt();

        Self {
            gravity: [
                tilt[0] / length,
                tilt[1] / length,
                -1.0 / length * draw.within(-0.2, 1.0).signum(),
            ],
            angvel: draw.triple(3.0),
            linvel: draw.triple(1.0),
            command: [draw.within(0.0, 0.4), draw.within(-0.2, 0.2), draw.within(-0.5, 0.5)],
            z: draw.within(0.02, 0.2),
            joints: [
                draw.many(JOINTS, 0.8),
                draw.many(JOINTS, 6.0),
                draw.many(JOINTS, 1.0),
                draw.many(JOINTS, 1.0),
            ],
            bodies: Vec::new(),
        }
    }

    fn view(&self) -> RewardState<'_> {
        RewardState {
            gravity: self.gravity,
            angvel: self.angvel,
            linvel: self.linvel,
            command: self.command,
            z: self.z,
            z0: 0.13,
            control_dt: 0.02,
            joint_pos: &self.joints[0],
            joint_vel: &self.joints[1],
            action: &self.joints[2],
            last_action: &self.joints[3],
            bodies: &self.bodies,
        }
    }
}

fn schema() -> Schema {
    Schema {
        joints: JOINTS,
        bodies: 0,
    }
}

fn check_matches(program: &Program, reference: fn(&RewardState) -> f64) {
    let mut draw = Draw(7);
    let mut falls = 0;

    for _ in 0..STATES {
        let owned = Owned::random(&mut draw);
        let state = owned.view();
        let expected = handwritten::scaled(&state, reference(&state));
        let got = program.evaluate(&state);

        falls += usize::from(handwritten::fell(&state));
        assert!(got.blamed.is_empty(), "blamed {:?}", got.blamed);
        assert!(
            (got.total - expected).abs() <= 1e-9 * expected.abs().max(1.0),
            "{} against {expected}",
            got.total
        );
    }

    assert!(
        falls > 20 && falls < STATES - 20,
        "the states must cover falls and upright poses"
    );
}

fn explicitly_named(test: &str) -> bool {
    std::env::args().any(|arg| arg == test)
}

#[test]
fn matches_handwritten() {
    check_matches(
        &compile(&programs::stand(), schema()).expect("stand compiles"),
        handwritten::stand,
    );
    check_matches(
        &compile(&programs::walk(), schema()).expect("walk compiles"),
        handwritten::walk,
    );
}

#[test]
fn canary_wrong_term_fails() {
    if !explicitly_named("canary_wrong_term_fails") {
        return;
    }

    let wrong = programs::stand().replace("0.5 * height(state)", "0.4 * height(state)");

    check_matches(&compile(&wrong, schema()).expect("compiles"), handwritten::stand);
}

fn rejected(source: &str, reason: &str) {
    let error = compile(source, schema()).expect_err(&format!("must reject:\n{source}"));

    assert!(error.contains(reason), "{source}\n gave: {error}\n wanted: {reason}");
}

#[test]
fn rejects() {
    rejected(
        "def reward(state):\n    while True:\n        x = 1\n    return 1.0\n",
        "Loops",
    );
    rejected(
        "def reward(state):\n    for i in range(3):\n        x = 1\n    return 1.0\n",
        "Loops",
    );
    rejected(
        "def reward(state):\n    return sum(i for i in range(10))\n",
        "Unknown function range",
    );
    rejected(
        "def reward(state):\n    return sum(state.z for b in state.joint_pos)\n",
        "state.bodies",
    );
    rejected("def reward(state):\n    return foo\n", "Unknown name foo");
    rejected("def reward(state):\n    return state.secret\n", "no field secret");
    rejected("def reward(state):\n    return state.__class__\n", "__");
    rejected("def reward(state):\n    state = 1\n    return 1.0\n", "read-only");
    rejected("def reward(state):\n    state.z = 1\n    return 1.0\n", "read-only");
    rejected(
        "def reward(state):\n    state.joint_pos[0] = 1\n    return 1.0\n",
        "read-only",
    );
    rejected("import os\ndef reward(state):\n    return 1.0\n", "Imports");
    rejected("from os import path\ndef reward(state):\n    return 1.0\n", "Imports");
    rejected("def reward(state):\n    import os\n    return 1.0\n", "Imports");
    rejected("def reward(state):\n    return __import__(\"os\")\n", "__");
    rejected("def reward(state):\n    return exec(\"1\")\n", "Unknown function exec");
    rejected("def reward(state):\n    return open(\"x\")\n", "Unknown function open");
    rejected("def reward(state):\n    return reward(state)\n", "defined above");
    rejected("def reward(state):\n    return state.z / state.z0\n", "safe_div");
    rejected("def reward(state):\n    return state.z ** 0.5\n", "Powers");
    rejected("def reward(state):\n    f = lambda x: x\n    return 1.0\n", "Lambdas");
    rejected("x = 1\ndef reward(state):\n    return 1.0\n", "top level");
    rejected("def reward(state):\n    exp = 3\n    return 1.0\n", "can't be assigned");
    rejected(
        "def reward(state):\n    return term(\"a\", 1.0) + term(\"a\", 2.0)\n",
        "named twice",
    );
    rejected(
        "def helper(state):\n    return term(\"a\", 1.0)\ndef reward(state):\n    return helper(state)\n",
        "term belongs",
    );
    rejected(
        "def reward(state):\n    return state.joint_pos\n",
        "must return a number",
    );
    rejected("def other(state):\n    return 1.0\n", "def reward");
}

#[test]
fn nan_blames_term() {
    let program = compile(&programs::stand(), schema()).expect("compiles");
    let mut owned = Owned::random(&mut Draw(3));

    owned.joints[1][4] = f64::NAN;

    let result = program.evaluate(&owned.view());
    let speed = result.terms.iter().find(|t| t.name == "joint_speed").expect("logged");
    let others: f64 = result
        .terms
        .iter()
        .filter(|t| t.name != "joint_speed")
        .map(|t| t.value)
        .sum::<f64>();

    assert_eq!(result.blamed, vec!["joint_speed".to_owned()]);
    assert_eq!(speed.value, 0.0);
    assert!(result.total.is_finite());
    assert!(result.terms.len() == 8 && others.is_finite());

    owned.joints[1][4] = 0.0;

    assert!(program.evaluate(&owned.view()).blamed.is_empty());
}

#[test]
fn operators_stay_total_and_loops_cover_bodies() {
    let source =
        "def reward(state):\n    a = safe_div(1.0, state.z - state.z)\n    b = exp(1e6) + log(0.0) + sqrt(-4.0)\n    \
                  c = sum(b.z for b in state.bodies) + max(b.vel[0] for b in state.bodies)\n    \
                  return term(\"a\", a) + term(\"b\", b) + term(\"c\", c)\n";
    let program = compile(
        source,
        Schema {
            joints: JOINTS,
            bodies: 2,
        },
    )
    .expect("compiles");
    let mut owned = Owned::random(&mut Draw(5));

    owned.bodies = vec![
        BodyState {
            pos: [0.0, 0.0, 0.25],
            vel: [0.5, 0.0, 0.0],
        },
        BodyState {
            pos: [0.0, 0.0, 0.75],
            vel: [-0.5, 0.0, 0.0],
        },
    ];

    let result = program.evaluate(&owned.view());

    assert!(result.blamed.is_empty());
    assert_eq!(result.terms[0].value, 0.0);
    assert!(result.terms[1].value.is_finite());
    assert!((result.terms[2].value - 1.5).abs() < 1e-12);
}

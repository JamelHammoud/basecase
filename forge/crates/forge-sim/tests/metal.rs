#![cfg(target_os = "macos")]

mod common;

use common::{ctrl, quadruped, write, Servo, HULL_FOOT, PRISM_FOOT};
use forge_mujoco::{Batch, Model};
use forge_sim::MetalBatch;

const NSIM: usize = 7;
const ROUNDS: usize = 6;
const LONG: usize = 60;
const DECIMATION: usize = 10;
const TOLERANCE: f64 = 1e-5;

trait Rows {
    fn row(&mut self, sim: usize) -> &mut [f64];
    fn expand(&mut self, field: &str) -> (&mut [f64], usize);
    fn advance(&mut self, nstep: usize) -> usize;
}

impl Rows for Batch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        Batch::row(self, sim)
    }

    fn expand(&mut self, field: &str) -> (&mut [f64], usize) {
        Batch::expand(self, field).expect("expand")
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }
}

impl Rows for MetalBatch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        MetalBatch::row(self, sim)
    }

    fn expand(&mut self, field: &str) -> (&mut [f64], usize) {
        MetalBatch::expand(self, field).expect("expand")
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }
}

fn scale_params(rows: &mut dyn Rows, field: &str, f: impl Fn(&mut [f64; 10], f64)) {
    let (values, width) = rows.expand(field);

    for (sim, row) in values.chunks_exact_mut(width).enumerate() {
        row.as_chunks_mut::<10>().0.iter_mut().for_each(|p| f(p, sim as f64));
    }
}

fn randomize(rows: &mut dyn Rows) {
    let (friction, width) = rows.expand("geom_friction");

    for (sim, row) in friction.chunks_exact_mut(width).enumerate() {
        row.iter_mut().step_by(3).for_each(|f| *f *= 0.7 + 0.08 * sim as f64);
    }

    let (mass, width) = rows.expand("body_mass");

    for (sim, row) in mass.chunks_exact_mut(width).enumerate() {
        row[1..]
            .iter_mut()
            .enumerate()
            .for_each(|(b, m)| *m *= 0.9 + 0.02 * ((sim + b) % 7) as f64);
    }

    scale_params(rows, "actuator_gainprm", |p, s| p[0] *= 0.9 + 0.03 * s);
    scale_params(rows, "actuator_biasprm", |p, s| {
        p[1] *= 0.9 + 0.03 * s;
        p[2] *= 0.9 + 0.03 * s;
    });
}

struct Drive {
    nsim: usize,
    rounds: usize,
}

fn drive(rows: &mut dyn Rows, model: &Model, d: &Drive) -> Vec<Vec<f64>> {
    let layout = Batch::new(model, 1, 1).expect("layout").layout();

    for round in 0..d.rounds {
        for sim in 0..d.nsim {
            let row = rows.row(sim);

            for a in 0..model.nu() {
                row[layout.ctrl + a] = ctrl(sim, a, round);
            }
        }

        assert_eq!(rows.advance(DECIMATION), 0);
    }

    (0..d.nsim).map(|s| rows.row(s).to_vec()).collect()
}

fn compare_xml(xml: &str, nsim: usize) -> f64 {
    let path = write(xml);
    let (model, kernel) = forge_ir::load(&path).expect("the test robot is in the subset");
    let mut c = Batch::new(&model, nsim, 2).expect("C batch");
    let mut metal = MetalBatch::new(&model, kernel, nsim).expect("Metal batch");
    let d = Drive { nsim, rounds: ROUNDS };

    randomize(&mut metal);
    randomize(&mut c);

    let ours = drive(&mut metal, &model, &d);
    let reference = drive(&mut c, &model, &d);
    let o = metal.offsets();
    let motion = o.qpos..o.qvel + model.nv();

    ours.iter()
        .zip(&reference)
        .flat_map(|(a, b)| {
            a[motion.clone()]
                .iter()
                .zip(&b[motion.clone()])
                .map(|(x, y)| (x - y).abs() / y.abs().max(1.0))
        })
        .fold(0.0, f64::max)
}

fn servo(attrs: &str, foot: &str) -> f64 {
    compare_xml(&quadruped(&Servo { attrs, foot }), NSIM)
}

const SERVO: &str = r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#;

#[test]
fn metal_rows_match_the_c_batch_with_randomized_tables() {
    let worst = servo(SERVO, HULL_FOOT);

    assert!(worst < TOLERANCE, "worst relative difference {worst:e}");
}

#[test]
fn metal_delayed_servos_match_the_c_batch() {
    for attrs in [
        r#"kp="11" kv="0.05" forcerange="-1.9 1.9" delay="0.007" nsample="6" interp="linear""#,
        r#"kp="9" kv="0.02" delay="0.004" nsample="4" interp="zoh""#,
    ] {
        let worst = servo(attrs, HULL_FOOT);

        assert!(worst < TOLERANCE, "{attrs}: worst relative difference {worst:e}");
    }
}

#[test]
fn metal_primitive_feet_match_the_c_batch() {
    for foot in [
        r#"type="sphere" size="0.012" pos="0 0 -0.058""#,
        r#"type="capsule" fromto="0 0 0 0.01 0 -0.058" size="0.01""#,
        r#"type="box" size="0.012 0.01 0.03" pos="0 0 -0.035" euler="0.2 0.1 0""#,
        r#"type="cylinder" size="0.012 0.03" pos="0 0 -0.035" euler="0.4 0 0""#,
        PRISM_FOOT,
    ] {
        let worst = servo(SERVO, foot);

        assert!(worst < TOLERANCE, "{foot}: worst relative difference {worst:e}");
    }
}

fn link(depth: usize, leg: usize, links: usize) -> String {
    if depth == links {
        return String::new();
    }

    let axis = ["1 0 0", "0 1 0", "0 0 1"][(depth + leg) % 3];
    let inner = link(depth + 1, leg, links);

    format!(
        r#"<body name="l{leg}_{depth}" pos="0 0 -0.03">
        <joint name="j{leg}_{depth}" type="hinge" axis="{axis}" range="-1 1" damping="0.02" armature="0.004" frictionloss="0.01"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.03" size="0.006" contype="1" conaffinity="0" mass="0.03"/>
        {inner}
      </body>"#
    )
}

fn centipede(legs: usize, links: usize) -> String {
    let body: String = (0..legs)
        .map(|leg| {
            let x = 0.05 * (leg / 2) as f64 - 0.025 * (legs / 2) as f64;
            let y = if leg % 2 == 0 { 0.04 } else { -0.04 };

            format!(
                r#"<body name="hip{leg}" pos="{x} {y} 0">{}</body>"#,
                link(0, leg, links)
            )
        })
        .collect();
    let actuators: String = (0..legs)
        .flat_map(|leg| (0..links).map(move |d| format!(r#"<position joint="j{leg}_{d}" kp="2" ctrlrange="-1 1"/>"#)))
        .collect();

    format!(
        r#"<mujoco model="centipede">
  <option timestep="0.002" integrator="implicitfast"/>
  <default><geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/></default>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    <body name="root" pos="0 0 {height}">
      <freejoint name="root"/>
      <geom type="box" size="{half} 0.05 0.01" contype="1" conaffinity="0" mass="0.5"/>
      {body}
    </body>
  </worldbody>
  <actuator>{actuators}</actuator>
</mujoco>"#,
        height = 0.03 * links as f64 + 0.01,
        half = 0.03 * legs as f64,
    )
}

#[test]
fn metal_robots_past_32_dofs_match_the_c_batch() {
    for (legs, links) in [(8, 4), (10, 5), (2, 20)] {
        let worst = compare_xml(&centipede(legs, links), 5);

        assert!(
            worst < TOLERANCE,
            "{legs} legs of {links} links: worst relative difference {worst:e}"
        );
    }
}

#[test]
fn metal_robot_steps_the_same_alone_as_in_a_batch() {
    let path = write(&quadruped(&Servo {
        attrs: SERVO,
        foot: HULL_FOOT,
    }));
    let (model, kernel) = forge_ir::load(&path).expect("in the subset");
    let mut batch = MetalBatch::new(&model, kernel.clone(), 40).expect("Metal batch");
    let mut alone = MetalBatch::new(&model, kernel, 1).expect("Metal batch");
    let together = drive(&mut batch, &model, &Drive { nsim: 40, rounds: LONG });
    let layout = Batch::new(&model, 1, 1).expect("layout").layout();
    let start = Batch::new(&model, 1, 1).expect("start").row(0).to_vec();

    for sim in [0, 3, 6, 21, 39] {
        alone.row(0).copy_from_slice(&start);

        for round in 0..LONG {
            for a in 0..model.nu() {
                alone.row(0)[layout.ctrl + a] = ctrl(sim, a, round);
            }

            alone.step(DECIMATION);
        }

        let same = alone
            .row(0)
            .iter()
            .zip(&together[sim])
            .all(|(a, b)| a.to_bits() == b.to_bits());

        assert!(same, "robot {sim} stepped differently in the batch");
    }
}

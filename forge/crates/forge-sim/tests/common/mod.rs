#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

const HULL: &str = "0.01 0.01 0 0.01 -0.01 0 0.01 -0.01 -0.065 -0.01 0.01 0 \
                    -0.01 0.01 -0.065 -0.01 -0.01 -0.065 0.01 0.01 -0.065 -0.01 -0.01 0";
const BODY: &str =
    "0.08 -0.1 0 0.08 0.1 0.05 0.08 -0.1 0.05 0.08 0.1 0 -0.08 0.1 0 -0.08 0.1 0.05 -0.08 -0.1 0 -0.08 -0.1 0.05";

pub struct Servo<'a> {
    pub attrs: &'a str,
}

fn leg(i: usize, x: f64, y: f64) -> String {
    format!(
        r#"<body name="hip{i}" pos="{x} {y} 0">
        <joint name="a{i}" type="hinge" axis="0 -1 0" range="-0.7 0.7" damping="0.038" armature="0.0076" frictionloss="0.019"/>
        <geom type="mesh" mesh="leg" contype="1" conaffinity="0" mass="0.07"/>
        <body name="knee{i}" pos="0 0 -0.065">
          <joint name="b{i}" type="hinge" axis="1 0 0" range="-2.2 2.2" damping="0.038" armature="0.0076" frictionloss="0.019"/>
          <geom type="mesh" mesh="leg" contype="1" conaffinity="0" mass="0.07"/>
        </body>
      </body>"#
    )
}

pub fn quadruped(servo: &Servo) -> String {
    let legs: String = [(-0.07, 0.09), (0.07, 0.09), (-0.07, -0.09), (0.07, -0.09)]
        .iter()
        .enumerate()
        .map(|(i, (x, y))| leg(i, *x, *y))
        .collect();
    let actuators: String = (0..4)
        .flat_map(|i| [format!("a{i}"), format!("b{i}")])
        .map(|j| {
            format!(
                r#"<position name="{j}" joint="{j}" ctrlrange="-0.7 0.7" {}/>"#,
                servo.attrs
            )
        })
        .collect();

    format!(
        r#"<mujoco model="forge-sim test">
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  <option timestep="0.002" integrator="implicitfast"/>
  <default><geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/></default>
  <asset>
    <mesh name="body" vertex="{BODY}" maxhullvert="96" inertia="convex"/>
    <mesh name="leg" vertex="{HULL}" maxhullvert="96" inertia="convex"/>
  </asset>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    <body name="root" pos="0 0 0.135">
      <freejoint name="root"/>
      <geom type="mesh" mesh="body" contype="1" conaffinity="0" mass="0.7"/>
      {legs}
    </body>
  </worldbody>
  <actuator>{actuators}</actuator>
</mujoco>"#
    )
}

pub fn write(text: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("forge-sim-{}-{n}", std::process::id()));

    std::fs::create_dir_all(&dir).expect("temp dir");

    let path = dir.join("model.xml");

    std::fs::write(&path, text).expect("write model");
    path
}

pub fn ctrl(sim: usize, actuator: usize, round: usize) -> f64 {
    0.3 * ((round as f64) * 0.11 + (sim * 3 + actuator) as f64 * 0.7).sin()
}

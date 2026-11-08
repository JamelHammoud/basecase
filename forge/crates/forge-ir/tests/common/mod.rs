#![allow(dead_code)]

use forge_ir::{Kernel, Refusal};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

pub const BOX_HULL: &str = "0.01 0.01 0 0.01 -0.01 0 0.01 -0.01 -0.06 -0.01 0.01 0 \
                            -0.01 0.01 -0.06 -0.01 -0.01 -0.06 0.01 0.01 -0.06 -0.01 -0.01 0";

pub struct Spec<'a> {
    pub option: &'a str,
    pub extra_assets: &'a str,
    pub leg_joint: &'a str,
    pub body_extra: &'a str,
    pub world_extra: &'a str,
    pub actuators: &'a str,
    pub tail: &'a str,
}

impl Default for Spec<'_> {
    fn default() -> Self {
        Self {
            option: r#"<option timestep="0.002" integrator="implicitfast"/>"#,
            extra_assets: "",
            leg_joint: r#"<joint name="hip" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.008" frictionloss="0.02"/>"#,
            body_extra: "",
            world_extra: "",
            actuators: r#"<position name="hip" joint="hip" kp="11" dampratio="1" forcerange="-1.9 1.9" ctrlrange="-1 1"/>"#,
            tail: "",
        }
    }
}

pub fn xml(spec: &Spec) -> String {
    format!(
        r#"<mujoco model="basecase">
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  {option}
  <default>
    <geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/>
  </default>
  <asset>
    <mesh name="body" vertex="{hull}" maxhullvert="96" inertia="convex"/>
    <mesh name="leg" vertex="{hull}" maxhullvert="96" inertia="convex"/>
    {assets}
  </asset>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    {world}
    <body name="root" pos="0 0 0.2">
      <freejoint name="root"/>
      <geom name="g_body" type="mesh" mesh="body" contype="1" conaffinity="0" mass="0.7"/>
      {body}
      <body name="leg" pos="0.05 0 -0.06">
        {joint}
        <geom name="g_leg" type="mesh" mesh="leg" contype="1" conaffinity="0" mass="0.07"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    {actuators}
  </actuator>
  {tail}
</mujoco>"#,
        option = spec.option,
        hull = BOX_HULL,
        assets = spec.extra_assets,
        world = spec.world_extra,
        body = spec.body_extra,
        joint = spec.leg_joint,
        actuators = spec.actuators,
        tail = spec.tail,
    )
}

pub fn write(text: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("forge-ir-{}-{n}", std::process::id()));

    std::fs::create_dir_all(&dir).expect("temp dir");

    let path = dir.join("model.xml");

    std::fs::write(&path, text).expect("write model");
    path
}

pub fn lower(spec: &Spec) -> Result<Kernel, Refusal> {
    forge_ir::load(&write(&xml(spec))).map(|(_, k)| k)
}

pub fn refusal(spec: &Spec) -> String {
    match lower(spec) {
        Ok(_) => panic!("the model was lowered, and it should have been refused"),
        Err(r) => r.to_string(),
    }
}

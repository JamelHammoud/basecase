mod common;

use common::{refusal, Spec, BOX_HULL};

fn refuses(spec: Spec, expected: &str) {
    let message = refusal(&spec);

    assert!(
        message.contains(expected),
        "expected the refusal to say {expected:?}, it said {message:?}"
    );
    assert!(message.starts_with("Forge's engine can't simulate this model exactly: "));
}

#[test]
fn refuses_other_integrators() {
    for (name, said) in [("Euler", "Euler"), ("RK4", "RK4"), ("implicit", "implicit integrator")] {
        let option = format!(r#"<option timestep="0.002" integrator="{name}"/>"#);

        refuses(
            Spec {
                option: &option,
                ..Spec::default()
            },
            said,
        );
    }
}

#[test]
fn refuses_other_solvers_and_cones() {
    let cases = [
        (r#"<option integrator="implicitfast" solver="PGS"/>"#, "PGS solver"),
        (r#"<option integrator="implicitfast" solver="CG"/>"#, "CG solver"),
        (
            r#"<option integrator="implicitfast" cone="elliptic"/>"#,
            "elliptic friction cones",
        ),
        (r#"<option integrator="implicitfast" noslip_iterations="3"/>"#, "noslip"),
        (r#"<option integrator="implicitfast" density="1.2"/>"#, "fluid forces"),
    ];

    for (option, said) in cases {
        refuses(
            Spec {
                option,
                ..Spec::default()
            },
            said,
        );
    }
}

#[test]
fn refuses_disabled_physics() {
    let cases = [
        (
            r#"<option integrator="implicitfast"><flag contact="disable"/></option>"#,
            "disables contacts",
        ),
        (
            r#"<option integrator="implicitfast"><flag gravity="disable"/></option>"#,
            "disables gravity",
        ),
        (
            r#"<option integrator="implicitfast"><flag sleep="enable"/></option>"#,
            "enables sleeping",
        ),
        (
            r#"<option integrator="implicitfast"><flag override="enable"/></option>"#,
            "contact override",
        ),
    ];

    for (option, said) in cases {
        refuses(
            Spec {
                option,
                ..Spec::default()
            },
            said,
        );
    }
}

#[test]
fn refuses_ball_joints_and_springs() {
    refuses(
        Spec {
            leg_joint: r#"<joint name="hip" type="ball"/>"#,
            actuators: "",
            ..Spec::default()
        },
        "joint hip is a ball joint",
    );
    refuses(
        Spec {
            leg_joint: r#"<joint name="hip" type="hinge" axis="1 0 0" stiffness="3"/>"#,
            ..Spec::default()
        },
        "joint hip has a spring",
    );
}

#[test]
fn refuses_model_elements_outside_the_subset() {
    let tendon = r#"<tendon><fixed name="t"><joint joint="hip" coef="1"/></fixed></tendon>"#;
    let equality = r#"<equality><joint joint1="hip" polycoef="0 1 0 0 0"/></equality>"#;
    let sensor = r#"<sensor><jointpos joint="hip"/></sensor>"#;
    let exclude = r#"<contact><exclude body1="root" body2="leg"/></contact>"#;

    for (tail, said) in [
        (tendon, "tendons"),
        (equality, "equality constraints"),
        (sensor, "sensors"),
        (exclude, "contact exclusions"),
    ] {
        refuses(
            Spec {
                tail,
                ..Spec::default()
            },
            said,
        );
    }
}

#[test]
fn refuses_actuators_outside_the_subset() {
    let cases = [
        (
            r#"<intvelocity name="hip" joint="hip" kp="5" actrange="-1 1"/>"#,
            "actuator activations",
        ),
        (
            r#"<general name="hip" joint="hip" gaintype="affine" gainprm="1 2 0"/>"#,
            "isn't a position",
        ),
        (
            r#"<motor name="hip" joint="root"/>"#,
            "drives something other than a hinge or slide joint",
        ),
        (
            r#"<position name="hip" joint="hip" kp="5" delay="0.01" nsample="6" interp="cubic"/>"#,
            "spline",
        ),
    ];

    for (actuators, said) in cases {
        refuses(
            Spec {
                actuators,
                ..Spec::default()
            },
            said,
        );
    }
}

#[test]
fn refuses_contacts_without_a_collider() {
    let mesh = format!(r#"<mesh name="prop" vertex="{BOX_HULL}"/>"#);

    refuses(
        Spec {
            extra_assets: &mesh,
            world_extra: r#"<geom name="prop" type="mesh" mesh="prop" pos="0.3 0 0.02" contype="1" conaffinity="1"/>"#,
            ..Spec::default()
        },
        "geom prop and geom g_body can touch, and Forge has no mesh-mesh collider",
    );
    refuses(
        Spec {
            body_extra: r#"<geom name="ball" type="ellipsoid" size="0.01 0.02 0.03" contype="1" conaffinity="0"/>"#,
            ..Spec::default()
        },
        "plane-ellipsoid collider",
    );
}

#[test]
fn refuses_rotational_friction() {
    refuses(
        Spec {
            body_extra: r#"<geom name="pad" type="mesh" mesh="leg" condim="6" contype="1" conaffinity="0"/>"#,
            ..Spec::default()
        },
        "condim 6 contacts",
    );
}

#[test]
fn refuses_free_bodies_without_jointed_children() {
    let mesh = format!(r#"<mesh name="crate" vertex="{BOX_HULL}"/>"#);

    refuses(
        Spec {
            extra_assets: &mesh,
            world_extra: r#"<body name="crate" pos="1 0 0.1"><freejoint/><geom type="mesh" mesh="crate" contype="1" conaffinity="0"/></body>"#,
            ..Spec::default()
        },
        "body crate is a free body with no jointed children",
    );
}

#[test]
fn refusals_list_every_reason() {
    let message = refusal(&Spec {
        option: r#"<option integrator="RK4" solver="PGS"/>"#,
        ..Spec::default()
    });

    assert!(message.contains("RK4") && message.contains("PGS"), "{message}");
}

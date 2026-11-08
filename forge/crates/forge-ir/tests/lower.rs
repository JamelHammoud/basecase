mod common;

use common::{lower, Spec};
use forge_ir::{Collider, Interp, JointKind, Shape};

#[test]
fn lowers_a_generated_robot() {
    let k = lower(&Spec::default()).expect("the generated robot is in the subset");

    assert_eq!((k.nq, k.nv, k.nu), (8, 7, 1));
    assert_eq!(k.joints[0].kind, JointKind::Free);
    assert_eq!(k.joints[1].kind, JointKind::Hinge);
    assert_eq!(k.joints[1].limit.as_ref().map(|l| l.range), Some([-1.0, 1.0]));
    assert_eq!(k.dofs[6].parent, Some(5));
    assert_eq!(k.dofs[6].friction.as_ref().map(|f| f.loss), Some(0.02));
    assert_eq!(k.dofs[6].damping, 0.04);
    assert_eq!(k.body_chain(2), vec![0, 1, 2, 3, 4, 5, 6]);
    assert_eq!(k.body_chain(1), vec![0, 1, 2, 3, 4, 5]);
    assert!(k.body_chain(0).is_empty());
    assert_eq!(k.options.timestep, 0.002);
    assert_eq!(k.options.iterations, 100);
}

#[test]
fn lowers_floor_contacts_with_mixed_parameters() {
    let k = lower(&Spec::default()).expect("lowered");

    assert_eq!(k.pairs.len(), 2);

    for pair in &k.pairs {
        assert_eq!(pair.collider, Collider::PlaneConvex);
        assert_eq!(k.geoms[pair.geoms[0]].shape, Shape::Plane);
        assert!(matches!(k.geoms[pair.geoms[1]].shape, Shape::Mesh(_)));
        assert_eq!(pair.condim, 3);
        assert_eq!(pair.friction, [0.9, 0.9, 0.02, 0.002, 0.002]);
        assert_eq!(pair.solref, [0.004, 1.0]);
        assert_eq!(pair.max_contacts, 4);
    }

    let mesh = &k.meshes[0];

    assert_eq!(mesh.vertices.len(), 8);
    assert_eq!(mesh.faces.len(), 6);
    assert!(mesh.faces.iter().all(|f| f.vertices.len() == 4));
    assert_eq!(mesh.vertex_faces.len(), 8);
}

#[test]
fn lowers_servo_gains_with_compiled_damping() {
    let k = lower(&Spec::default()).expect("lowered");
    let a = &k.actuators[0];

    assert_eq!((a.dof, a.qposadr, a.gear), (6, 7, 1.0));
    assert_eq!(a.gain, 11.0);
    assert_eq!(a.bias[1], -11.0);
    assert!(a.bias[2] < 0.0, "dampratio compiles into a negative velocity bias");
    assert_eq!(a.force_range, Some([-1.9, 1.9]));
    assert_eq!(a.ctrl_range, Some([-1.0, 1.0]));
    assert!(a.delay.is_none());
}

#[test]
fn lowers_a_linear_delay() {
    let spec = Spec {
        actuators: r#"<position name="hip" joint="hip" kp="11" kv="0" delay="0.01" nsample="6" interp="linear"/>"#,
        ..Spec::default()
    };
    let k = lower(&spec).expect("a delayed servo is in the subset");
    let delay = k.actuators[0].delay.as_ref().expect("delay");

    assert_eq!(delay.samples, 6);
    assert_eq!(delay.seconds, 0.01);
    assert_eq!(delay.interp, Interp::Linear);
}

#[test]
fn lowers_velocity_actuators_and_slide_joints() {
    let spec = Spec {
        leg_joint: r#"<joint name="hip" type="slide" axis="0 0 1" range="-0.02 0.02" damping="0.1"/>"#,
        actuators: r#"<velocity name="hip" joint="hip" kv="3"/>"#,
        ..Spec::default()
    };
    let k = lower(&spec).expect("lowered");

    assert_eq!(k.joints[1].kind, JointKind::Slide);
    assert_eq!(k.actuators[0].gain, 3.0);
    assert_eq!(k.actuators[0].bias, [0.0, 0.0, -3.0]);
}

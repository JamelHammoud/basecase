export const newDesign = {
  name: 'new_design',
  use: "robots that don't exist yet (no reference photos)",
  text: `
You are the designer; the evidence is the brief, engineering practice and comparable robots.
1. Brief → requirements: size, DOF per limb, payload, actuators, compute, battery, sensors and
   manufacturing method. Pick real parts from find_parts first. Ask nothing; choose sensible
   defaults and state them.
2. Name 2–3 comparable robots and what you borrow from each. Pick the kinematic layout.
3. Skeleton first: joint positions and link lengths from the target size and the priors guide,
   sized around the actuators (size_actuators). Check the centre of mass over the support polygon.
4. Visual language: 2–3 traits applied to every part (e.g. soft rounded shells, one horizontal
   split line, an accent colour on joint covers) so it reads as one product.
5. Then the normal workflow from the block-out. For a small arm or biped, start from
   find_recipes "arm_template" or "biped_template" and restyle around their joint frames.
6. Every mechanism is visible and credible: an actuator housing per DOF, both sides of every
   servo held, wheels at the base edge with drive wheels near the centre of mass, a lift with
   rails, carriage and drive, grippers with their linkage. find_recipes and the catalog
   (servo_u_bracket, linear_lift, parallel_gripper, wheels, real grippers and hands) first.
7. Stability: support half-width ≥ ~0.3 × the centre-of-mass height for a mobile robot; centre
   of mass over the stance foot for a biped.
8. Electronics have a home: a battery bay with a hatch, compute on a tray behind one cover,
   vents, and a cable path through hollow joints or a channel.`,
};

export const priors = {
  name: 'priors',
  use: 'proportion defaults when photos are unclear, and robot archetypes',
  text: `
- Fractions of standing height H (adult human; robots stay close unless the photo says
  otherwise): head 0.13 tall, shoulder joint height 0.82, shoulder spacing 0.20–0.26, hip joint
  height 0.50–0.53, hip spacing 0.10–0.12, knee height 0.28, ankle height 0.04–0.06, upper arm
  0.19, forearm 0.15, hand 0.11, thigh 0.24, shank 0.25, foot length 0.15, torso depth 0.11–0.14.
- Limb widths in the front view (human, approximate): thigh 0.08–0.10 H, shank 0.06–0.07, upper
  arm 0.05–0.06, forearm 0.045–0.05. Small servo robots run wider, because the servo sets the
  smallest section.
- Humanoids: a pelvis with a 3-DOF hip per leg (yaw, roll, pitch), knee, 2-DOF ankle, waist yaw,
  a torso shell over a chassis, 3-DOF shoulder, elbow, 1–3 DOF wrist, hand. Large robots use
  pancake actuators (qdd_actuator) wrapped by shells with round joint covers.
- Wheeled mobile manipulators: a low heavy base, a slim lift column much narrower than the
  torso, a torso carrying the shoulders, 6–7 DOF arms, a head on a 1–2 DOF neck.
- Legs: hip, knee and ankle axes stack vertically in the home pose; feet flat on z = 0.
- Small printed humanoids: ROBOTIS OP3 51 cm, 3.5 kg, 20 servos; ToddlerBot 56 cm, 3.4 kg,
  30 DOF. Biped chain (BDX / Open Duck Mini): hip yaw → roll → pitch → knee → ankle.
- Hexapods: a body shell over a chassis plate, 2–3 servos per leg (coxa, femur, tibia).
- Arms: base → shoulder → elbow → wrist → end effector, a servo at each pivot.`,
};

export const simready = {
  name: 'simready',
  use: 'real objects for the robot to handle (SimReady)',
  text: `
- find_objects searches SimReady Central for real objects with measured size, mass and friction,
  and makers' arms and grippers (kind "robot"); insert_object(url, position) inserts one.
- Use them when the robot has a job ("pick up the mug"): size the gripper opening, reach and
  payload from the object's numbers, then simulate with it in place.
- They're the world, not the robot: never use them as robot parts, and never insert one the
  task doesn't need.`,
};

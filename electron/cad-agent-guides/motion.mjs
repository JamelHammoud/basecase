export const joints = {
  name: 'joints',
  use: 'declaring joints with define_joints',
  text: `
- Give every joint of every limb to define_joints with the parts of its link in child (shells,
  brackets, the servo that rides on it). Screws, inserts and nuts follow the part they clamp on
  their own; don't list them.
- When two joints share a link (a 2-DOF wrist or hip), set parent_joint on the second.
- Ranges come from what the joint must do (the brief, a gait, a reach), not from what currently
  clears. When a range clips, cut relief or move the part; verify_design reports any range
  narrower than its first definition.`,
};

export const motion = {
  name: 'motion',
  use: 'poses, animations and motion capture',
  text: `
- Posing never edits parts: pose and animate only change what the canvas shows.
- get_rig first: joint ids, axes, ranges, feet and mocap landmarks. A scene can hold several
  robots; pose / animate / retarget_motion take robot (the selected one by default).
- Named poses: pose with values for the joints you know, ik for reaching (feet flat with where:
  bottom and keep_orientation), root to lower or turn the body. Fix anything it reports (a value
  at a limit, links passing through, a foot below the floor). save_as when the user may want it.
- Walk cycles: animate with gait; if a foot misses its path, shorten the stride or lift, or add
  crouch. Oscillators swing the arms. Check with preview (side view).
- Gestures: 3–8 keyframes, the first and last the same for a loop.
- Motion capture: retarget_motion with the .bvh; pass bones / joints to fix a bad match.
- import_robot inserts a published robot with its real joints.
- make_leader turns a fixed-base arm into a hand-held leader in a new scene tab, for teleoperation
  and recording demonstrations.`,
};

export const simulation = {
  name: 'simulation',
  use: 'MuJoCo simulation, training, the Peak torque and Falls tests and design sweeps',
  text: `
- Design checks use hold and shove: simulate with controller "hold" for 5 s, then shoves of 0.3
  × body weight from each side. If it falls, or a servo sits at its limit for long, fix the design
  (feet, center of mass, servo, lever length), not the test.
- Open-loop keyframe gaits fall even on good designs, so simulate "animation:<name>" says little
  about the design. Whether it walks is answered by a trained skill: train_skill kit "walk"
  (velocity tracking, proved in Arena), then start_drive drives it. Once a walk policy exists,
  verify_design with peak: true walks it with every servo derated to 0.7 × stall; fix any joint
  that asks for more than its stall.
- verify_design with falls: true tips a legged robot over from 12 directions with its servos
  derated the same way, and grades each leg joint's impact torque against its rated torque. For a
  joint that fails, pick a stronger servo with size_actuators or lower the stance, then run it again.
- sweep_design tries one parameter at a time (a servo for a set of joints, a battery offset, foot
  length or width) on copies of the scene and returns the deltas in torque, price, stability and
  a derated hold-and-shove sim. Choose with it instead of guessing, then apply the winner.
- explore_case answers which servo to buy for a Case: it runs the Case on each catalog version of
  every joint's servo and each supply voltage they're rated at (up to 64 designs, 8 seeded runs
  each) and returns passes, worst margin, cost and mass per design. Recommend the cheapest design
  that passes every run, and say what it costs over the current one.
- Objects from find_objects move freely in the sim; size grippers and reach from their numbers.
- set_world puts test objects around the robot (static steps and walls, dynamic boxes, marker
  goals); they never become parts. start_drive then drives it like a person would: arms follow
  the end effector, rovers mix their wheels, four or more legs walk on baked cycles after a fall
  check; a robot with a trained walk (any legged robot, bipeds included) drives through it.
  Without one, start_drive says how to train it.
- Cameras: simulate with cameras returns what the robot's camera parts (or the scene's camera
  views) saw at each frame; operate drives the live sim one step at a time and returns those
  views after each step, for tasks steered by sight. A camera part's lens comes from its catalog
  field of view; the user can switch any camera to a fisheye.
- Anything else the user wants the robot to do is a skill: draft_skill writes the contract and
  shows it, train_skill races solvers on it and Arena judges the result (see Slash commands).`,
};

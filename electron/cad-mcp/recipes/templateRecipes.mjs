import { armTemplate, bipedTemplate } from './templates.mjs';

const NOTE =
  'Each printed part is one model_part call; each link is servo_link(length, twist): the U-link of one joint fused to the cradle of the next. Ranges are starting values: run verify_design. Restyle the links (shells, covers) around the same joint frames rather than moving joints.';

export const TEMPLATE_RECIPES = [
  {
    name: 'arm_template',
    use: 'SO-101-like desk arm, ready to edit: base yaw, shoulder, elbow and wrist pitch on STS3215 servos (12 V C018), a base plate with 4 × M3, and a wrist flange with 4 × M3 inserts for a gripper.',
    tags: 'arm template robot manipulator so-101 so101 so-100 desk arm starter example servo chain',
    params: 'none: change servo_link lengths (≥ 75 mm) and twists, then move the parts further out by the same amount',
    ports: 'per part, as in servo_link, servo_base and servo_u_link',
    notes: `${NOTE} The arm reaches toward -Y at rest (all joints at 0).`,
    template: armTemplate,
  },
  {
    name: 'biped_template',
    use: 'Open Duck-like small biped, ready to edit: 4 STS3215 joints per leg (hip roll, hip pitch, knee, ankle), a hip frame holding both hip cradles, a Pi 5 tray and a 2S battery bay with its hatch on top.',
    tags: 'biped template robot legs walker humanoid duck open-duck legged starter example servo chain',
    params: 'none: change link lengths and the hip spacing in place, keeping the joint frames consistent',
    ports: 'per part, as in servo_link, servo_cradle, pi5_tray and battery_bay',
    notes: `${NOTE} Legs hang down from hip-roll axes 124 mm apart; the feet stand on z = 0. Add a torso shell over the hip frame with seam_shell, leaving the battery hatch outside it.`,
    template: bipedTemplate,
  },
];

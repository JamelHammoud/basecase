export const ROBOTS = {
  'berkeley-humanoid': {
    title: 'Berkeley Humanoid',
    repo: 'HybridRobotics/berkeley_humanoid_description',
    urdf: 'urdf/robot.urdf',
    prompt:
      'This is the Berkeley Humanoid research robot. Design the torso and legs (leave the arms off) as a printable, part-based CAD model.',
  },
  'reachy-mini': {
    title: 'Reachy Mini',
    repo: 'pollen-robotics/reachy_mini',
    urdf: 'src/reachy_mini/descriptions/reachy_mini/urdf/robot_no_collision.urdf',
    prompt:
      'This is Reachy Mini by Pollen Robotics. Design it as a printable, part-based CAD model, in its rest pose with the head lowered all the way onto the body.',
  },
  'open-duck-mini': {
    title: 'Open Duck Mini v2',
    repo: 'apirrone/Open_Duck_Mini',
    urdf: 'mini_bdx/robots/open_duck_mini_v2/robot.urdf',
    prompt: 'This is the Open Duck Mini v2 bipedal robot. Design it as a printable, part-based CAD model.',
  },
  'unitree-g1': {
    title: 'Unitree G1',
    repo: 'unitreerobotics/unitree_ros',
    urdf: 'robots/g1_description/g1_29dof_rev_1_0.urdf',
    offline: true,
    pose: { left_elbow_joint: Math.PI / 2, right_elbow_joint: Math.PI / 2 },
    prompt:
      'This is the Unitree G1 humanoid robot, about 1.3 m tall. Design it as a part-based CAD model, standing with its arms hanging straight down at its sides.',
  },
  'concept-home-helper': {
    title: 'Concept: home helper',
    concept: true,
    prompt:
      'Design a new home-assistant robot (not an existing product): about 1.3 m tall, a compact wheeled base that fits through doorways, a torso on a vertical lift, two 6-DOF arms with two-finger grippers, and a friendly head with a stereo camera. It should look approachable and be buildable with off-the-shelf actuators. Design it as a part-based CAD model.',
  },
  'concept-desk-biped': {
    title: 'Concept: desktop biped',
    concept: true,
    prompt:
      'Design a new 3D-printable desktop bipedal robot (not an existing product), about 35 cm tall: STS3215 servos (5 per leg, 2 in the neck), a Raspberry Pi 5 and a 2S battery in the torso, and an expressive head with two round eyes. Design it as a part-based CAD model.',
  },
  'build-humanoid': {
    title: 'Build: small humanoid',
    concept: true,
    build: true,
    prompt:
      'Design a new small humanoid robot (not an existing product) that I will actually build: every structural part printed on my Bambu Lab P1S, everything else bought. About 50 cm tall, in the design language of Fauna Robotics\u2019 Sprout (look it up): soft rounded shells, a wide visor head with a round face display and expressive eyebrows, accent-coloured joint caps and chunky feet with rubber soles. ' +
      'Feetech STS3215 bus servos: 5–6 per leg (your call, from the torque check), 4 per arm with a simple printed gripper, and a 2-DOF neck. A Raspberry Pi 5 with a camera and an IMU, and a battery I can swap. Budget: $800 for everything, filament included. ' +
      'It has to pass the app\u2019s checks: joints, torque, range of motion, power, stability, printability and the BOM.',
  },
  'part-xl430': {
    title: 'Dynamixel XL430-W250-T (part)',
    allOrientations: true,
    modelItYourself: true,
    judgeRefs: 'judge-refs',
    prompt:
      'This is the ROBOTIS Dynamixel XL430-W250-T smart servo (case 28.5 × 46.5 × 34 mm; the output horn is on one 28.5 × 34 face). Model it yourself with model_part as a detailed CAD part, at the level of detail of the manufacturer’s own CAD model: don’t place the catalog part.',
  },
  'part-oak1': {
    title: 'Luxonis OAK-1 (part)',
    allOrientations: true,
    modelItYourself: true,
    judgeRefs: 'judge-refs',
    prompt:
      'This is the Luxonis OAK-1 AI camera: a die-cast aluminium enclosure with heat-sink fins, about 36 × 54.5 × 27.8 mm overall including the fins. Model it yourself with model_part as a detailed CAD part, at the level of detail and finish of the manufacturer’s own CAD model: don’t place the catalog part.',
  },
  microduck: {
    title: 'MicroDuck',
    repo: 'pollen-robotics/microduck',
    mjcfSkeleton: 'kinematics/assets/alpha/robot_walk.xml',
    prompt:
      'This is MicroDuck, the tiny biped duck robot by Pollen Robotics. Design it as a printable, part-based CAD model.',
  },
};

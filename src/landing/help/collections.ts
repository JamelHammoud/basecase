export interface CollectionInfo {
  slug: string;
  title: string;
  description: string;
}

export const HELP_COLLECTIONS: CollectionInfo[] = [
  {
    slug: 'get-started',
    title: 'Get started',
    description: 'Install Basecase, pose and simulate your first robot, and find your way around the window.',
  },
  {
    slug: 'design',
    title: 'Design',
    description:
      'Place real parts, shape and combine your own, bring in CAD, meshes and robots, and set them on a real place.',
  },
  {
    slug: 'engineer',
    title: 'Engineer',
    description: 'Add joints, pose the robot, and check torque, range, stability and printability.',
  },
  {
    slug: 'simulate-and-train',
    title: 'Simulate and train',
    description: 'Run the robot in MuJoCo, drive it, try Cases, train skills and export datasets.',
  },
  {
    slug: 'build-and-print',
    title: 'Build and print',
    description: 'Clear the Checks, price the parts, and slice and send plates to your printer.',
  },
  {
    slug: 'operate',
    title: 'Operate',
    description: 'Connect an emulated robot, climb the safety ladder and calibrate its servos.',
  },
  {
    slug: 'agent',
    title: 'Agent',
    description: 'Choose the agent, describe what to build and work with it on a design.',
  },
  {
    slug: 'files-and-sharing',
    title: 'Files and sharing',
    description: 'Save to the Library, export scenes and robot packages, and open what others send you.',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Fixes for the agent, imports, printing and updates, by the message you see.',
  },
];

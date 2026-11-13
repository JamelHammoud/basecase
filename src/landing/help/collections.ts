export interface CollectionInfo {
  slug: string;
  title: string;
  description: string;
}

export const HELP_COLLECTIONS: CollectionInfo[] = [
  {
    slug: 'get-started',
    title: 'Get started',
    description: 'Install Basecase, open your first scene and find your way around the studio.',
  },
  {
    slug: 'design',
    title: 'Design',
    description: 'Shape parts, place real components, import meshes and robots, and lay out a scene.',
  },
  {
    slug: 'engineer',
    title: 'Engineer',
    description: 'Add joints, pose the robot, and check torque, range, stability and printability.',
  },
  {
    slug: 'simulate-and-train',
    title: 'Simulate and train',
    description: 'Run the robot in MuJoCo, record Cases and teach it new skills.',
  },
  {
    slug: 'build-and-print',
    title: 'Build and print',
    description: 'Clear the Checks, price the parts, and slice and send plates to your printer.',
  },
  {
    slug: 'operate',
    title: 'Operate',
    description: 'Connect a robot, calibrate its servos and drive it.',
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
    description: 'Fixes for problems with the app, the agent, simulation and printing.',
  },
];

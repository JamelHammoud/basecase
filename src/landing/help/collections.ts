export interface CollectionInfo {
  slug: string;
  title: string;
  description: string;
}

export const HELP_COLLECTIONS: CollectionInfo[] = [
  {
    slug: 'design',
    title: 'Design',
    description: 'Import meshes and robots, measure parts and line them up.',
  },
  {
    slug: 'simulate-and-train',
    title: 'Simulate and train',
    description: "Publish a Case's passed tries as a LeRobot dataset.",
  },
  {
    slug: 'build-and-print',
    title: 'Build and print',
    description: 'Clear the Checks, price the parts, and slice and send plates to your printer.',
  },
  {
    slug: 'operate',
    title: 'Operate',
    description: 'Connect an emulated robot and calibrate its servos.',
  },
  {
    slug: 'agent',
    title: 'Agent',
    description: 'Pick Claude Code, Codex, Gemini CLI or Offline to design with you.',
  },
  {
    slug: 'files-and-sharing',
    title: 'Files and sharing',
    description: 'Save to the Library, export scenes and robot packages, and open what others send you.',
  },
];

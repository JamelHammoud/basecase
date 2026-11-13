export interface RobotLinkRef {
  robot: string;
  link: string;
  url?: string;
  rotate?: Array<[string, number]>;
  version: number;
  fixedMates?: string[];
}

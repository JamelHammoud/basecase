export interface RoboflowProject {
  workspace: string;
  project: string;
  version?: number;
}
export const LINK_HINT: string;
export function isRoboflowLink(link: unknown): boolean;
export function projectOfLink(link: unknown): RoboflowProject;

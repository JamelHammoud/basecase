import { isOnshapeLink } from '../onshape/onshapeLink';
import { isRoboflowLink } from '../roboflow/roboflowLink';
import { isRobotLink } from '../utils/robotImport';

export const canImportLink = (link: string, desktop: boolean) =>
  isRobotLink(link) || (desktop && (isOnshapeLink(link) || isRoboflowLink(link)));

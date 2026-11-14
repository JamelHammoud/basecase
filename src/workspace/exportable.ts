import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';

export const isExportedSolid = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

export const goesOnPlate = (p: ScenePart) => isPrinted(p) && !p.print?.skip;

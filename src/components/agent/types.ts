import { ImageViewerItem } from '../../design-system';
import { ReferenceImageRecord } from '../../types/robotics';
import { EvidenceFolder } from '../../utils/evidenceFiles';

export type OpenImages = (images: ImageViewerItem[], index: number) => void;

export type SendIntent = 'default' | 'now' | 'queue';

export interface QueuedDraft {
  text: string;
  images?: ReferenceImageRecord[];
  folders?: EvidenceFolder[];
}

export interface QueuedItem {
  id: string;
  params: QueuedDraft;
}

export interface QueueSlotRef {
  laneId: string;
  index: number;
  item: QueuedItem;
}

export interface QueueControls {
  items: QueuedItem[];
  move: (from: number, to: number) => void;
  remove: (itemId: string) => void;
  take: (itemId: string) => QueueSlotRef | null;
  put: (slot: QueueSlotRef, params: QueuedDraft) => void;
  sendNow: (itemId: string) => Promise<void>;
}

export interface AgentDraftParams extends QueuedDraft {
  targetHeightMm?: number;
  model?: string;
  effort?: string;
}

export type SendToAgent = (params: AgentDraftParams, mode?: 'now' | 'queue') => Promise<void>;

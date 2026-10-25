import type { HardwareSpec } from '../data/hardware';
import type { RobotJoint, ScenePart } from '../types/robotics';

export type V3 = [number, number, number];

export interface Box {
  min: V3;
  max: V3;
}

export interface GuideScene {
  title: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  boxes: Record<string, Box>;
  contacts: Record<string, string[]>;
  axes: Record<string, V3>;
}

export type GuideItemKind = 'printed' | 'bought' | 'hardware';

export interface GuideItem {
  key: string;
  label: string;
  kind: GuideItemKind;
  name: string;
  detail: string;
  qty: number;
  partIds: string[];
  sample: string;
  hardware?: HardwareSpec;
}

export type ToolIcon =
  'hex-key' | 'torx' | 'screwdriver' | 'flat-screwdriver' | 'wrench' | 'soldering-iron' | 'printer';

export interface GuideTool {
  id: string;
  name: string;
  size?: string;
  icon: ToolIcon;
  itemKeys: string[];
}

export interface GuideMove {
  partId: string;
  offset: V3;
}

export interface GuideArrow {
  from: V3;
  to: V3;
  style: 'part' | 'fastener';
}

export type GuideStepKind = 'build' | 'inserts' | 'attach' | 'mirror';

export interface GuideStep {
  kind: GuideStepKind;
  number: number;
  moduleId: string;
  partIds: string[];
  contextIds: string[];
  moves: GuideMove[];
  arrows: GuideArrow[];
  callout: Array<{ key: string; qty: number }>;
  tools: string[];
  attach?: string;
}

export interface GuideModule {
  id: string;
  name: string;
  partIds: string[];
  parent: string | null;
  repeatOf?: string;
  mirrored?: boolean;
  copies: number;
}

export interface GuidePlan {
  title: string;
  items: GuideItem[];
  tools: GuideTool[];
  modules: GuideModule[];
  steps: GuideStep[];
  partIds: string[];
}

export const MAIN_MODULE = 'main';

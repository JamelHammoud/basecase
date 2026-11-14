import type { ReactNode } from 'react';
import type { Command } from '../components/CommandPalette';
import { MoveIcon, RotateIcon, type ContextMenuEntry } from '../design-system';
import type { HandJointType } from '../joints/declare';
import type { HandJoints } from './useHandJoints';

interface HandJointEntry {
  type: HandJointType;
  label: string;
  keywords: string;
  icon: ReactNode;
}

const ENTRIES: HandJointEntry[] = [
  {
    type: 'revolute',
    label: 'Add Hinge',
    keywords: 'joint revolute axis pivot rotate',
    icon: <RotateIcon />,
  },
  {
    type: 'prismatic',
    label: 'Add Slider',
    keywords: 'joint prismatic linear slide rail',
    icon: <MoveIcon />,
  },
];

export const handJointMenuItems = (joints: HandJoints): ContextMenuEntry[] =>
  joints.canJoin
    ? [
        ...ENTRIES.map((e) => ({
          label: e.label,
          icon: e.icon,
          onSelect: () => void joints.start(e.type),
        })),
        { divider: true },
      ]
    : [];

export const handJointCommands = (joints: HandJoints): Command[] =>
  joints.canJoin
    ? ENTRIES.map((e) => ({
        id: `hand-joint-${e.type}`,
        group: 'Selection',
        label: e.label,
        icon: e.icon,
        keywords: e.keywords,
        run: () => void joints.start(e.type),
      }))
    : [];

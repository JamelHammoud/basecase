import React from 'react';
import {
  CheckIcon,
  CodeIcon,
  CompareIcon,
  DeleteIcon,
  EditIcon,
  FileIcon,
  JointsIcon,
  LookIcon,
  PhotoIcon,
  PoseIcon,
  ObjectsIcon,
  RobotsIcon,
  RunIcon,
  SearchIcon,
  ShapeIcon,
  ToolIcon as ToolPromptIcon,
  TrainIcon,
  WebIcon,
} from '../../design-system';

export type ToolIcon = React.FC<{ className?: string }>;

export interface ToolLabel {
  title: string;
  detail?: string;
}

export interface LabelContext {
  input: Record<string, unknown>;
  verb: (ing: string, ed: string) => string;
}

export interface ToolRule {
  keys: string[];
  icon: ToolIcon;
  label: (ctx: LabelContext) => ToolLabel | null;
}

const list = (arr: unknown): unknown[] => (Array.isArray(arr) ? arr : []);

const nameOf = (p: unknown) => (p as { name?: string; id?: string }).name ?? (p as { id?: string }).id ?? String(p);

const names = (arr: unknown[]) => arr.map(nameOf).join(', ');

const optional = (text: string) => text || undefined;

const fileName = (path: unknown) =>
  String(path ?? '')
    .split('/')
    .pop() || undefined;

const hostOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
};

const counted = (count: number, noun: string) => {
  if (count === 0) return `${noun}s`;

  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

const partGroups = (parts: unknown[]) =>
  Array.from(new Set(parts.map((p) => (p as { group?: string }).group).filter(Boolean))) as string[];

const controllerName = (controller: string) => {
  const [kind, name] = controller.split(':');

  if (kind === 'animation') return `${name} animation`;

  if (kind === 'policy') return `${name} policy`;

  return kind === 'limp' ? 'Limp, no motor torque' : 'Holding the pose';
};

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const partsRule = (key: string, icon: ToolIcon, [ing, ed]: [string, string]): ToolRule => ({
  keys: [key],
  icon,
  label: ({ input, verb }) => {
    const ids = list(input.ids);

    return { title: `${verb(ing, ed)} ${counted(ids.length, 'part')}`, detail: optional(names(ids)) };
  },
});

const plainRule = (keys: string[], icon: ToolIcon, [ing, ed]: [string, string]): ToolRule => ({
  keys,
  icon,
  label: ({ verb }) => ({ title: verb(ing, ed) }),
});

const PART_RULES: ToolRule[] = [
  {
    keys: ['model_part'],
    icon: ShapeIcon,
    label: ({ input, verb }) => ({
      title: `${verb('Designing', 'Designed')} ${(input.name as string) || (input.id as string) || 'part'}`,
    }),
  },
  {
    keys: ['get_part_code'],
    icon: CodeIcon,
    label: ({ input, verb }) => ({
      title: verb('Reading part code', 'Read part code'),
      detail: optional(String(input.id ?? '')),
    }),
  },
  {
    keys: ['add_parts'],
    icon: ShapeIcon,
    label: ({ input, verb }) => {
      const parts = list(input.parts);

      return {
        title: `${verb('Blocking out', 'Blocked out')} ${counted(parts.length, 'part')}`,
        detail: optional(partGroups(parts).join(', ') || names(parts)),
      };
    },
  },
  {
    keys: ['update_parts'],
    icon: EditIcon,
    label: ({ input, verb }) => {
      const updates = list(input.updates);

      return {
        title: `${verb('Adjusting', 'Adjusted')} ${counted(updates.length, 'part')}`,
        detail: optional(names(updates)),
      };
    },
  },
  partsRule('delete_parts', DeleteIcon, ['Removing', 'Removed']),
  partsRule('mirror_parts', EditIcon, ['Mirroring', 'Mirrored']),
  {
    keys: ['find_parts'],
    icon: SearchIcon,
    label: ({ input, verb }) => ({
      title: verb('Searching parts', 'Searched parts'),
      detail: optional(String(input.query ?? '')),
    }),
  },
  plainRule(['get_scene'], FileIcon, ['Reading the scene', 'Read the scene']),
];

const REVIEW_RULES: ToolRule[] = [
  {
    keys: ['compare'],
    icon: CompareIcon,
    label: ({ input, verb }) => ({
      title: verb('Comparing with', 'Compared with') + ` ${String(input.reference ?? 'the reference')}`,
    }),
  },
  {
    keys: ['look'],
    icon: LookIcon,
    label: ({ input, verb }) => {
      const ids = list(input.ids);

      return {
        title: ids.length
          ? `${verb('Inspecting', 'Inspected')} ${names(ids)}`
          : verb('Looking at the model', 'Looked at the model'),
      };
    },
  },
  plainRule(['check_scene'], CheckIcon, ['Checking the model', 'Checked the model']),
  {
    keys: ['check_printability'],
    icon: CheckIcon,
    label: ({ input, verb }) => ({
      title: verb('Checking printability', 'Checked printability'),
      detail: optional(names(list(input.ids))),
    }),
  },
  plainRule(['verify_design'], CheckIcon, ['Verifying the design', 'Verified the design']),
  plainRule(['get_bom'], FileIcon, ['Reading the parts list', 'Read the parts list']),
  plainRule(['set_build'], FileIcon, ['Updating the build', 'Updated the build']),
  plainRule(['build_guide'], FileIcon, ['Making the build guide', 'Made the build guide']),
];

const ROBOT_RULES: ToolRule[] = [
  {
    keys: ['robot_skeleton'],
    icon: JointsIcon,
    label: ({ input, verb }) => ({
      title: verb('Reading the joint layout', 'Read the joint layout'),
      detail: fileName(input.url),
    }),
  },
  {
    keys: ['check_skeleton'],
    icon: JointsIcon,
    label: ({ input, verb }) => ({
      title: verb('Checking the joint layout', 'Checked the joint layout'),
      detail: fileName(input.url),
    }),
  },
  {
    keys: ['find_robot_description'],
    icon: SearchIcon,
    label: ({ input, verb }) => ({
      title: verb('Finding the robot description', 'Found the robot description'),
      detail: optional(String(input.name ?? '')),
    }),
  },
  {
    keys: ['define_joints'],
    icon: JointsIcon,
    label: ({ input, verb }) => {
      const joints = list(input.joints);

      return {
        title: `${verb('Defining', 'Defined')} ${counted(joints.length, 'joint')}`,
        detail: optional(names(joints)),
      };
    },
  },
  plainRule(['get_rig'], JointsIcon, ['Reading the joints', 'Read the joints']),
  plainRule(['pose'], PoseIcon, ['Posing the robot', 'Posed the robot']),
  {
    keys: ['animate'],
    icon: RunIcon,
    label: ({ input, verb }) => ({
      title: `${verb('Animating', 'Animated')} ${(input.name as string) || 'the robot'}`,
    }),
  },
  {
    keys: ['retarget_motion'],
    icon: PoseIcon,
    label: ({ input, verb }) => ({
      title: verb('Retargeting motion', 'Retargeted motion'),
      detail: optional(String(input.name ?? '')) ?? fileName(input.file ?? input.url),
    }),
  },
  {
    keys: ['import_robot'],
    icon: RobotsIcon,
    label: ({ input, verb }) => ({
      title: verb('Inserting a robot', 'Inserted a robot'),
      detail: optional(String(input.preset ?? '')) ?? fileName(input.url),
    }),
  },
  {
    keys: ['find_objects'],
    icon: SearchIcon,
    label: ({ input, verb }) => ({
      title: verb('Searching SimReady', 'Searched SimReady'),
      detail: optional(String(input.query ?? '')),
    }),
  },
  {
    keys: ['insert_object'],
    icon: ObjectsIcon,
    label: ({ verb }) => ({ title: verb('Inserting an object', 'Inserted an object') }),
  },
  {
    keys: ['simulate'],
    icon: RunIcon,
    label: ({ input, verb }) => ({
      title: `${verb('Simulating', 'Simulated')} ${Number(input.seconds ?? 5)} s`,
      detail: controllerName(String(input.controller ?? 'hold')),
    }),
  },
  {
    keys: ['train_policy'],
    icon: TrainIcon,
    label: ({ input, verb }) => ({
      title: verb('Starting training', 'Started training'),
      detail: optional(capitalized(String(input.task ?? ''))),
    }),
  },
  plainRule(['training_status'], TrainIcon, ['Checking training', 'Checked training']),
];

const SOURCE_RULES: ToolRule[] = [
  plainRule(['list_evidence'], FileIcon, ['Listing attached files', 'Listed attached files']),
  {
    keys: ['read_evidence'],
    icon: FileIcon,
    label: ({ input, verb }) => {
      const paths = list(input.paths).map((p) => String(p).split('/').pop() ?? '');

      return {
        title: `${verb('Studying', 'Studied')} ${paths.length > 1 ? `${paths.length} attached files` : 'an attached file'}`,
        detail: optional(names(paths)),
      };
    },
  },
  {
    keys: ['find_images'],
    icon: PhotoIcon,
    label: ({ input, verb }) => ({
      title: verb('Finding photos', 'Found photos'),
      detail: optional(hostOf(input.url)),
    }),
  },
  {
    keys: ['view_image'],
    icon: PhotoIcon,
    label: ({ input, verb }) => {
      const urls = list(input.urls);

      return { title: `${verb('Looking at', 'Looked at')} ${urls.length > 1 ? `${urls.length} photos` : 'a photo'}` };
    },
  },
  {
    keys: ['websearch'],
    icon: SearchIcon,
    label: ({ input, verb }) => ({ title: verb('Searching', 'Searched'), detail: optional(String(input.query ?? '')) }),
  },
  {
    keys: ['webfetch'],
    icon: WebIcon,
    label: ({ input, verb }) => ({ title: verb('Reading', 'Read'), detail: optional(hostOf(input.url)) }),
  },
  plainRule(['compact'], FileIcon, ['Summarizing the chat', 'Summarized the chat']),
];

const AGENT_RULE: ToolRule = {
  keys: ['agent', 'task'],
  icon: ToolPromptIcon,
  label: ({ input }) => ({ title: String(input.description ?? '') || 'Subagent' }),
};

export const HIDDEN_TOOLS = ['set_status', 'todowrite'];

export const TOOL_RULES: ToolRule[] = [...PART_RULES, ...REVIEW_RULES, ...ROBOT_RULES, ...SOURCE_RULES, AGENT_RULE];

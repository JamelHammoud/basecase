import { AcpToolCallEvent } from '../../types/robotics';

export interface ToolLabel {
  title: string;
  detail?: string;
}

interface LabelContext {
  input: Record<string, unknown>;
  verb: (ing: string, ed: string) => string;
}

type LabelRule = [keys: string[], label: (ctx: LabelContext) => ToolLabel | null];

const list = (arr: unknown): unknown[] => (Array.isArray(arr) ? arr : []);

const nameOf = (p: unknown) => (p as { name?: string; id?: string }).name ?? (p as { id?: string }).id ?? String(p);

const names = (arr: unknown[]) =>
  arr.map(nameOf).slice(0, 3).join(', ') + (arr.length > 3 ? ` +${arr.length - 3}` : '');

const optional = (text: string) => text || undefined;

const hostOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
};

const counted = (text: string) => text.replace('  ', ' ');

const partGroups = (parts: unknown[]) =>
  Array.from(new Set(parts.map((p) => (p as { group?: string }).group).filter(Boolean))) as string[];

const RULES: LabelRule[] = [
  [['set_status', 'todowrite', 'todo'], () => null],
  [
    ['model_part'],
    ({ input, verb }) => ({
      title: `${verb('Designing', 'Designed')} ${(input.name as string) || (input.id as string) || 'part'}`,
      detail: input.language === 'replicad' ? 'OpenCascade' : 'OpenSCAD',
    }),
  ],
  [
    ['get_part_code'],
    ({ input, verb }) => ({
      title: verb('Reading part code', 'Read part code'),
      detail: optional(String(input.id ?? '')),
    }),
  ],
  [
    ['add_parts'],
    ({ input, verb }) => {
      const parts = list(input.parts);

      return {
        title: counted(`${verb('Blocking out', 'Blocked out')} ${parts.length || ''} parts`),
        detail: optional(partGroups(parts).join(', ') || names(parts)),
      };
    },
  ],
  [
    ['update_parts'],
    ({ input, verb }) => {
      const updates = list(input.updates);

      return {
        title: counted(`${verb('Adjusting', 'Adjusted')} ${updates.length || ''} parts`),
        detail: optional(names(updates)),
      };
    },
  ],
  [
    ['delete_parts'],
    ({ input, verb }) => {
      const ids = list(input.ids);

      return { title: `${verb('Removing', 'Removed')} ${ids.length} parts`, detail: optional(names(ids)) };
    },
  ],
  [
    ['mirror_parts'],
    ({ input, verb }) => {
      const ids = list(input.ids);

      return { title: `${verb('Mirroring', 'Mirrored')} ${ids.length} parts`, detail: optional(names(ids)) };
    },
  ],
  [
    ['compare'],
    ({ input, verb }) => ({
      title: verb('Comparing with', 'Compared with') + ` ${String(input.reference ?? 'the reference')}`,
      detail: optional(list(input.views).join(', ')),
    }),
  ],
  [
    ['look'],
    ({ input, verb }) => {
      const ids = list(input.ids);

      return {
        title: ids.length
          ? `${verb('Inspecting', 'Inspected')} ${names(ids)}`
          : verb('Looking at the model', 'Looked at the model'),
        detail: optional(list(input.views).join(', ')),
      };
    },
  ],
  [['check_scene'], ({ verb }) => ({ title: verb('Checking the model', 'Checked the model') })],
  [
    ['robot_skeleton'],
    ({ input, verb }) => ({
      title: verb('Reading the joint layout', 'Read the joint layout'),
      detail:
        String(input.url ?? '')
          .split('/')
          .pop() || undefined,
    }),
  ],
  [['list_evidence'], ({ verb }) => ({ title: verb('Listing attached files', 'Listed attached files') })],
  [
    ['read_evidence'],
    ({ input, verb }) => {
      const paths = list(input.paths).map((p) => String(p).split('/').pop() ?? '');

      return {
        title: `${verb('Studying', 'Studied')} ${paths.length > 1 ? `${paths.length} attached files` : 'an attached file'}`,
        detail: optional(names(paths)),
      };
    },
  ],
  [
    ['find_images'],
    ({ input, verb }) => ({ title: verb('Finding photos', 'Found photos'), detail: optional(hostOf(input.url)) }),
  ],
  [
    ['view_image'],
    ({ input, verb }) => {
      const urls = list(input.urls);

      return { title: `${verb('Looking at', 'Looked at')} ${urls.length > 1 ? `${urls.length} photos` : 'a photo'}` };
    },
  ],
  [['get_scene'], ({ verb }) => ({ title: verb('Reading the scene', 'Read the scene') })],
  [
    ['websearch', 'web search'],
    ({ input, verb }) => ({ title: verb('Searching', 'Searched'), detail: optional(String(input.query ?? '')) }),
  ],
  [
    ['webfetch', 'fetch'],
    ({ input, verb }) => ({ title: verb('Reading', 'Read'), detail: optional(hostOf(input.url)) }),
  ],
];

export function toolLabel(tc: AcpToolCallEvent): ToolLabel | null {
  const name = `${tc.toolName ?? ''} ${tc.title ?? ''}`.toLowerCase();
  const done = tc.status === 'completed';
  const ctx: LabelContext = {
    input: (tc.rawInput ?? {}) as Record<string, unknown>,
    verb: (ing, ed) => (done ? ed : ing),
  };
  const rule = RULES.find(([keys]) => keys.some((key) => name.includes(key)));

  return rule ? rule[1](ctx) : { title: tc.title || 'Tool' };
}

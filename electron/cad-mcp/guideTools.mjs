import { z } from 'zod';
import { GUIDES, guideText } from '../cad-agent-guides/index.mjs';
import { text } from './shared.mjs';

const SHELL_WORDS = /head|torso|shell|cover|body|carapace|dome|cap|base|chassis|housing/i;
const SERVO_WORDS = /servo|sts3\d{3}|xl3\d0|xl430|xm\d{3}|xh\d{3}|mg996|sg90|dynamixel|feetech|actuator|qdd/i;
const POWER_WORDS =
  /battery|ovonic|18650|21700|holder|regulator|pololu-d|buck|raspberry|pi-?5|pi-?zero|jetson|board|imu/i;

const catalogKeys = (args) => (args?.parts ?? []).map((p) => String(p.catalog ?? ''));
const partWords = (args) => [args?.id, args?.name, ...(args?.parts ?? []).flatMap((p) => [p.id, p.name])].join(' ');
const anyKey = (args, test) => catalogKeys(args).some((k) => test(k));

const TOOL_GUIDES = {
  look: ['photos'],
  compare: ['photos'],
  fit_view: ['photos'],
  read_evidence: ['photos'],
  view_image: ['photos'],
  fasten: ['fasteners'],
  get_bom: ['build'],
  set_build: ['build'],
  check_printability: ['build'],
  slice_plates: ['build'],
  size_actuators: ['servos'],
  define_joints: ['joints'],
  get_rig: ['motion'],
  pose: ['motion'],
  animate: ['motion'],
  retarget_motion: ['motion'],
  simulate: ['simulation'],
  train_policy: ['simulation'],
  find_objects: ['simready'],
  insert_object: ['simready'],
};

const ARG_GUIDES = [
  { tools: ['add_parts'], guide: 'priors', when: () => true },
  { tools: ['add_parts', 'model_part'], guide: 'shells', when: (args) => SHELL_WORDS.test(partWords(args)) },
  { tools: ['model_part'], guide: 'replicad', when: (args) => args?.language === 'replicad' },
  { tools: ['add_parts'], guide: 'servos', when: (args) => anyKey(args, (k) => SERVO_WORDS.test(k)) },
  { tools: ['add_parts'], guide: 'fasteners', when: (args) => anyKey(args, (k) => k.startsWith('hardware:')) },
  { tools: ['add_parts'], guide: 'electronics', when: (args) => anyKey(args, (k) => POWER_WORDS.test(k)) },
  { tools: ['find_parts'], guide: 'servos', when: (args) => SERVO_WORDS.test(String(args?.query ?? '')) },
];

export function guidesFor(tool, args) {
  return [
    ...(TOOL_GUIDES[tool] ?? []),
    ...ARG_GUIDES.filter((rule) => rule.tools.includes(tool) && rule.when(args)).map((rule) => rule.guide),
  ];
}

export function createGuidePusher() {
  const sent = new Set();

  return (tool, args, result) => {
    if (!result || result.isError || !Array.isArray(result.content)) return result;

    const fresh = [...new Set(guidesFor(tool, args))].filter((name) => !sent.has(name));

    if (!fresh.length) return result;

    for (const name of fresh) sent.add(name);

    const guides = fresh.map(guideText).filter(Boolean);

    return { ...result, content: [...result.content, { type: 'text', text: guides.join('\n\n') }] };
  };
}

export const getGuide = {
  name: 'get_guide',
  config: {
    title: 'Read guide',
    description: `Returns one design guide. The instructions list them; tool results also attach each one the first time it applies. Names: ${Object.keys(GUIDES).join(', ')}.`,
    inputSchema: { name: z.enum(Object.keys(GUIDES)) },
  },
  handler: async ({ name }) => text(guideText(name)),
};

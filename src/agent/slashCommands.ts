export type SlashName = 'train' | 'routine' | 'case' | 'simulate' | 'operate' | 'check';

export interface SlashCommand {
  name: SlashName;
  label: string;
  hint: string;
  keywords: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = Object.freeze([
  { name: 'train', label: 'Teach a Skill', hint: 'Teach the robot a skill', keywords: 'train skill learn policy' },
  { name: 'routine', label: 'Make a Routine', hint: 'Build or change a Routine', keywords: 'routine behaviour steps' },
  { name: 'case', label: 'Make a Case', hint: 'A world and a goal to try', keywords: 'case challenge world goal' },
  {
    name: 'simulate',
    label: 'Simulate the Scene',
    hint: 'Run the scene in the sim',
    keywords: 'sim physics mujoco run',
  },
  {
    name: 'operate',
    label: 'Operate the Robot',
    hint: 'Do a task by watching its cameras',
    keywords: 'operate control camera teleop task pick look',
  },
  { name: 'check', label: 'Run Checks', hint: 'Check the design is ready to build', keywords: 'check ready build' },
]);

const QUERY = /^\/([a-z]*)$/i;

export function slashQuery(text: string): string | null {
  const match = QUERY.exec(text);

  return match ? match[1].toLowerCase() : null;
}

export function filterSlash(query: string): SlashCommand[] {
  const starts = SLASH_COMMANDS.filter((c) => c.name.startsWith(query));
  const inside = SLASH_COMMANDS.filter((c) => !c.name.startsWith(query) && c.name.includes(query));

  return [...starts, ...inside];
}

export const slashText = (name: SlashName) => `/${name} `;

export function withSlash(text: string, name: SlashName): string {
  if (slashQuery(text) !== null) return slashText(name);

  const rest = parseSlash(text)?.rest ?? text.trim();

  return `${slashText(name)}${rest}`;
}

const LEADING = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i;

export function parseSlash(text: string): { command: SlashName; rest: string } | null {
  const match = LEADING.exec(text.trim());
  const name = match?.[1].toLowerCase();
  const command = SLASH_COMMANDS.find((c) => c.name === name);

  return command ? { command: command.name, rest: (match?.[2] ?? '').trim() } : null;
}

export function stepSlash(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;

  return (((index + delta) % count) + count) % count;
}

import { asRecord, listOf, oneOf, refuse, type Reader } from './validate';

export const CONSOLE_INPUTS = ['keys', 'gamepad'] as const;
export const CONSOLE_PANELS = ['cameras', 'goal', 'joints', 'tries'] as const;

export type ConsoleInput = (typeof CONSOLE_INPUTS)[number];
export type ConsolePanel = (typeof CONSOLE_PANELS)[number];

export interface CaseConsole {
  input: ConsoleInput;
  panels: ConsolePanel[];
}

export const DEFAULT_CONSOLE: CaseConsole = { input: 'keys', panels: [...CONSOLE_PANELS] };

export const readConsole: Reader<CaseConsole> = (value, where) => {
  const v = asRecord(value, where);
  const panels = listOf(oneOf(CONSOLE_PANELS), CONSOLE_PANELS.length)(v.panels, `${where}.panels`);

  if (new Set(panels).size !== panels.length) refuse(`${where}.panels`, 'repeats a panel');

  return { input: oneOf(CONSOLE_INPUTS)(v.input, `${where}.input`), panels };
};

export interface CommandCenterLayout {
  input: ConsoleInput;
  cameras: boolean;
  column: Exclude<ConsolePanel, 'cameras'>[];
}

export function commandCenterLayout(
  caseConsole: CaseConsole | undefined,
  { desktop }: { desktop: boolean },
): CommandCenterLayout {
  const { input, panels } = caseConsole ?? DEFAULT_CONSOLE;
  const column = panels.filter(
    (p): p is CommandCenterLayout['column'][number] => p !== 'cameras' && (desktop || p !== 'joints'),
  );

  return { input, cameras: panels.includes('cameras'), column };
}

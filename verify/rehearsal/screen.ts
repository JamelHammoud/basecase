import type { Page } from 'playwright-core';
import type { Finding } from './personaScore';

export interface Screen {
  screenshot: () => Promise<Buffer>;
  accessibilityTree: () => Promise<string>;
  click: (x: number, y: number) => Promise<void>;
  type: (text: string) => Promise<void>;
  press: (key: string) => Promise<void>;
  scroll: (dx: number, dy: number) => Promise<void>;
}

export interface PersonaLab {
  runPersona: (input: { screen: Screen; goals: string[]; minutes: number }) => Promise<{ findings: Finding[] }>;
}

export const screenOf = (page: Page): Screen => ({
  screenshot: () => page.screenshot(),
  accessibilityTree: () => page.locator('body').ariaSnapshot(),
  click: (x, y) => page.mouse.click(x, y),
  type: (text) => page.keyboard.type(text),
  press: (key) => page.keyboard.press(key),
  scroll: (dx, dy) => page.mouse.wheel(dx, dy),
});

export const loadPersonaLab = () =>
  import('../lib/need').then(({ need }) => need<PersonaLab>('tools/persona/personaLab', ['runPersona']));

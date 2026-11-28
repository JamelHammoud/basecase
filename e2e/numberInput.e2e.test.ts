import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import type { Browser, Locator } from 'playwright-core';
import { build } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { launchChrome } from './harness';

let browser: Browser;
let script: string;
let styles: string;

beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [tailwindcss()],
    define: { 'process.env.NODE_ENV': '"production"' },
    oxc: { jsx: { development: false } },
    build: {
      write: false,
      rolldownOptions: { output: { codeSplitting: false } },
      lib: { entry: fileURLToPath(new URL('./numberInputFixture.jsx', import.meta.url)), formats: ['es'] },
    },
  });
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((result) =>
    'output' in result ? result.output : [],
  );

  script = outputs.flatMap((output) => (output.type === 'chunk' ? [output.code] : [])).join('\n');
  styles = outputs
    .flatMap((output) => (output.type === 'asset' && output.fileName.endsWith('.css') ? [output.source] : []))
    .join('\n');
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
});

async function geometry(field: Locator) {
  return field.evaluate((element) => {
    const input = element.querySelector('input')!;
    const control = input.parentElement!;
    const spans = [...control.querySelectorAll('span')];
    const label = spans[0];
    const unit = spans.at(-1)!;
    const textBounds = (node: Element) => {
      const range = document.createRange();

      range.selectNodeContents(node);

      return range.getBoundingClientRect().toJSON();
    };

    return {
      control: control.getBoundingClientRect().toJSON(),
      input: input.getBoundingClientRect().toJSON(),
      label: textBounds(label),
      unit: textBounds(unit),
      hasUnit: spans.length > 1,
    };
  });
}

it('keeps number labels, editable values and compound units apart at narrow widths through keyboard edits', async () => {
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.setContent('<!doctype html><div id="root"></div>');
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ type: 'module', content: script });
    await page.getByRole('textbox', { name: 'Min', exact: true }).waitFor();

    for (const field of await page.locator('[data-field]').all()) {
      const input = field.locator('input');

      await input.fill('1234567890123.123456');

      const bounds = await geometry(field);

      expect(bounds.label.left).toBeGreaterThanOrEqual(bounds.control.left);
      expect(bounds.label.right).toBeLessThanOrEqual(bounds.input.left);
      expect(bounds.input.width).toBeGreaterThan(15);
      expect(bounds.input.right).toBeLessThanOrEqual(bounds.control.right);
      expect(bounds.control.height).toBe(32);

      if (bounds.hasUnit) {
        expect(bounds.input.right).toBeLessThanOrEqual(bounds.unit.left);
        expect(bounds.unit.right).toBeLessThanOrEqual(bounds.control.right);
      }

      expect(await input.inputValue()).toBe('1234567890123.123456');
      await input.press('Escape');
      expect(await input.inputValue()).toBe('12.5');
      await input.fill('25 / 2');
      await input.press('Enter');
      expect(await input.inputValue()).toBe('12.5');
      await input.focus();
      await input.press('ArrowUp');
      await input.press('Tab');
      expect(await input.inputValue()).toBe('13.5');
    }

    expect(await page.getByRole('textbox', { name: 'Mixed', exact: true }).inputValue()).toBe('');
    expect(await page.getByRole('textbox', { name: 'Disabled', exact: true }).isDisabled()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});

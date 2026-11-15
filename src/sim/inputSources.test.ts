import { expect, it } from 'vitest';
import { consoleReader } from '../cases/console/format';
import { BUILTIN_INPUTS } from './inputRegistry';
import { inputSourceIds, readInputs, registerInputSource } from './inputSources';

const readConsole = (id: string) =>
  consoleReader({ probes: [] })({ input: [id], panels: [], layout: { areas: [{ canvas: true }] } }, 'console');

it('keeps declared, registered and parsed inputs consistent, including additional sources', () => {
  expect(new Set(inputSourceIds())).toEqual(new Set(BUILTIN_INPUTS));

  for (const id of inputSourceIds()) expect(readConsole(id).input).toEqual([id]);

  const command = { v: [0.5, 0, 0] as [number, number, number] };

  registerInputSource({ id: 'fixture-input', read: ({ keys }) => keys });

  const inputs = readConsole('fixture-input').input;

  expect(readInputs(inputs, { cls: 'rover', keys: command }).command).toEqual(command);
});

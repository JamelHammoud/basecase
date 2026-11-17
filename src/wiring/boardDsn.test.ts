import { expect, it } from 'vitest';
import { checkedDsn } from './boardDsn.mjs';

const base =
  '(pcb robot.dsn (parser (string_quote ") (host_version "9.0.6")) (resolution um 10) (unit um) (structure (layer F.Cu (type signal)) (layer B.Cu (type signal))) (library (image Robot:Header (pin Round 1 0 0))) (network) (wiring))';

it('accepts the bounded KiCad DSN subset including footprint image definitions', () => {
  expect(checkedDsn(base)).toBe(base);
});

it.each([
  '(include "../../secret")',
  '(file "https://example.com/design")',
  '(model "../part")',
  '(image (file "../secret"))',
  '(path In1.Cu 100 1 2 3 4)',
  '(path F.Cu NaN 1 2 3 4)',
])('refuses malicious or incompatible DSN before the router sees it', (field) => {
  expect(() => checkedDsn(base.replace('(wiring)', `(wiring ${field})`))).toThrow();
});

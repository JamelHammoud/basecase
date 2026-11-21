import { expect, it, vi } from 'vitest';
import { exposeTestHooks } from '../../e2e/harness';
import { BUNDLED_RATES, RATES_SOURCE } from '../../src/data/exchangeRates';

it('pins startup exchange rates for every page in the test context before app initialization', async () => {
  const routes = [];
  const context = {
    route: async (match, handle) => routes.push({ match, handle }),
  };
  const addInitScript = vi.fn(() => {
    expect(routes.some(({ match }) => typeof match === 'function' && match(new URL(RATES_SOURCE)))).toBe(true);
  });

  await exposeTestHooks({ context: () => context, addInitScript });

  const fixture = routes.find(({ match }) => typeof match === 'function' && match(new URL(RATES_SOURCE)));
  const fulfill = vi.fn();

  expect(fixture).toBeDefined();
  expect(fixture.match(new URL('https://example.com/'))).toBe(false);
  expect(fixture.match(new URL(`${RATES_SOURCE}&symbols=EUR`))).toBe(false);
  await fixture.handle({ fulfill });
  expect(fulfill).toHaveBeenCalledWith({
    headers: { 'access-control-allow-origin': '*' },
    json: { date: BUNDLED_RATES.date, rates: BUNDLED_RATES.perUsd },
  });
  expect(addInitScript).toHaveBeenCalledOnce();
});

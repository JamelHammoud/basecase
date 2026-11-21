import { describe, expect, it } from 'vitest';
import { allowed, ACTIONS } from '../../src/fleet/service/authorization.mjs';

const robot = {
  id: 'robot-a',
  org: 'org-a',
  kind: 'robot',
  ancestors: ['org-a', 'region-a', 'site-a', 'room-a'],
  attributes: { vendor: 'Acme', class: 'ground' },
  siteAttributes: { country: 'US' },
};
const grant = (effect, scope, actions = ['inventory.view'], conditions = {}) => ({
  effect,
  scope,
  actions,
  conditions,
});
const actor = (rules = [], org = 'org-a') => ({ org, rules });

describe('Fleet authorization', () => {
  it('denies by default and rejects cross-organization identities before grants', () => {
    expect(allowed(actor(), 'inventory.view', robot)).toBe(false);
    expect(allowed(actor([grant('allow', '*')], 'org-b'), 'inventory.view', robot)).toBe(false);
    expect(allowed(actor([grant('allow', '*')]), 'unknown', robot)).toBe(false);
  });

  it('includes descendant sites without granting access to their ancestors or siblings', () => {
    const viewer = actor([grant('allow', 'site-a')]);

    expect(allowed(viewer, 'inventory.view', robot)).toBe(true);
    expect(allowed(viewer, 'inventory.view', { ...robot, id: 'region-a', ancestors: ['org-a'] })).toBe(false);
    expect(allowed(viewer, 'inventory.view', { ...robot, ancestors: ['org-a', 'site-b'] })).toBe(false);
  });

  it('intersects all conditions and always gives matching denies precedence', () => {
    const conditions = { robot: { vendor: ['Acme'] }, site: { country: ['US'] } };
    const rules = [grant('allow', '*', ['inventory.view'], conditions)];

    expect(allowed(actor(rules), 'inventory.view', robot)).toBe(true);
    expect(allowed(actor(rules), 'inventory.view', { ...robot, siteAttributes: { country: 'DE' } })).toBe(false);
    expect(allowed(actor([...rules, grant('deny', 'room-a')]), 'inventory.view', robot)).toBe(false);
    expect(allowed(actor([grant('deny', 'room-a'), ...rules]), 'inventory.view', robot)).toBe(false);
  });

  it('keeps viewing, export, response, scheduling, deployment and control independent', () => {
    const viewer = actor([grant('allow', '*')]);

    for (const action of ACTIONS.filter((item) => item !== 'inventory.view'))
      expect(allowed(viewer, action, robot)).toBe(false);
  });

  it('applies the service credential ceiling even to an administrator', () => {
    const service = {
      ...actor([grant('allow', '*', ACTIONS)]),
      ceiling: [grant('allow', 'site-a', ['status.publish'])],
    };

    expect(allowed(service, 'status.publish', robot)).toBe(true);
    expect(allowed(service, 'robot.control', robot)).toBe(false);
    expect(allowed(service, 'status.publish', { ...robot, ancestors: ['org-a', 'site-b'] })).toBe(false);
  });
});

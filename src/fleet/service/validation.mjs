import { ACTIONS } from './authorization.mjs';

export class Refused extends Error {
  constructor(status = 400) {
    super('Fleet request refused');
    this.status = status;
  }
}

export function insist(condition, status = 400) {
  if (!condition) throw new Refused(status);
}

export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
export const identifier = (value) => {
  insist(isId(value));

  return value;
};
export const text = (value, max = 200) => {
  insist(typeof value === 'string' && value.length > 0 && value.length <= max);

  return value;
};
export const ids = (value = []) => {
  insist(Array.isArray(value) && value.length <= 100 && value.every(isId));

  return [...new Set(value)];
};

export function attributes(value = {}) {
  insist(isObject(value) && Object.keys(value).length <= 32);

  for (const [key, entry] of Object.entries(value)) {
    insist(/^[a-zA-Z][\w-]{0,31}$/.test(key));
    text(entry, 200);
  }

  return value;
}

function conditions(value = {}) {
  insist(isObject(value) && Object.keys(value).every((key) => key === 'robot' || key === 'site'));

  for (const entries of Object.values(value)) {
    insist(isObject(entries) && Object.keys(entries).length <= 16);

    for (const [key, values] of Object.entries(entries)) {
      text(key, 32);
      insist(Array.isArray(values) && values.length > 0 && values.length <= 32);
      values.forEach((item) => text(item, 200));
    }
  }

  return value;
}

export function rules(value) {
  insist(Array.isArray(value) && value.length <= 64);

  return value.map((rule) => {
    insist(isObject(rule) && ['allow', 'deny'].includes(rule.effect));
    insist(rule.scope === '*' || isId(rule.scope));
    insist(
      Array.isArray(rule.actions) &&
        rule.actions.length > 0 &&
        rule.actions.every((action) => ACTIONS.includes(action)),
    );

    return {
      effect: rule.effect,
      scope: rule.scope,
      actions: [...new Set(rule.actions)],
      conditions: conditions(rule.conditions),
    };
  });
}

export const KINDS = ['region', 'site', 'robot', 'role', 'group', 'account', 'asset'];
export const administrative = (kind) => ['role', 'group', 'account'].includes(kind);

export function resourceData(kind, body) {
  insist(isObject(body));

  const data = { name: text(body.name), attributes: attributes(body.attributes) };

  if (kind === 'role') return { ...data, rules: rules(body.rules) };

  if (kind === 'group') return { ...data, members: ids(body.members), roles: ids(body.roles) };

  if (kind === 'account') return { ...data, roles: ids(body.roles) };

  if (kind === 'asset') return { ...data, content: text(body.content, 32768), mediaType: 'text/plain' };

  return data;
}

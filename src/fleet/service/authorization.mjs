export const ACTIONS = Object.freeze([
  'inventory.view',
  'inventory.manage',
  'inventory.export',
  'incident.respond',
  'work.schedule',
  'software.deploy',
  'robot.control',
  'status.publish',
  'iam.manage',
]);

const inScope = (scope, resource) => scope === '*' || resource.id === scope || resource.ancestors.includes(scope);
const matchesAttributes = (conditions, attributes) =>
  Object.entries(conditions ?? {}).every(([key, values]) => values.includes(attributes?.[key]));
const matches = (rule, action, resource) =>
  rule.actions.includes(action) &&
  inScope(rule.scope, resource) &&
  matchesAttributes(
    rule.conditions?.robot,
    resource.kind === 'robot' ? resource.attributes : resource.robotAttributes,
  ) &&
  matchesAttributes(rule.conditions?.site, resource.siteAttributes);

function grants(rules, action, resource) {
  const matching = rules.filter((rule) => matches(rule, action, resource));

  return matching.some((rule) => rule.effect === 'allow') && !matching.some((rule) => rule.effect === 'deny');
}

export function allowed(actor, action, resource) {
  if (!actor || actor.org !== resource.org || !ACTIONS.includes(action)) return false;

  return grants(actor.rules, action, resource) && (!actor.ceiling || grants(actor.ceiling, action, resource));
}

import { latestModels } from './modelFamilies.mjs';

export const DEFAULT_MODEL = 'default';

const EFFORT_IDS = ['effort', 'reasoning_effort', 'thought_level'];
const LEVEL_NAMES = { xhigh: 'Extra high' };

const selects = (configOptions) =>
  Array.isArray(configOptions) ? configOptions.filter((o) => o.type === 'select') : [];

const modelOption = (configOptions) =>
  selects(configOptions).find((o) => o.id === 'model') ?? selects(configOptions).find((o) => o.category === 'model');

const effortOption = (configOptions) =>
  selects(configOptions).find((o) => o.category === 'thought_level') ??
  selects(configOptions).find((o) => EFFORT_IDS.includes(o.id));

const plainName = (name, id) => (id === DEFAULT_MODEL ? name.replace(/\s*\(recommended\)\s*$/i, '') : name);

const toModel = ({ id, name, description }) => ({
  id,
  name: plainName(name, id),
  ...(id === DEFAULT_MODEL && description ? { resolvesTo: description } : {}),
});

function catalogOf(response) {
  const option = modelOption(response?.configOptions);

  if (option?.options) {
    return {
      configId: option.id,
      current: option.currentValue,
      models: option.options.map((o) => toModel({ id: o.value, name: o.name, description: o.description })),
    };
  }

  const legacy = response?.models;

  if (!legacy?.availableModels?.length) return undefined;

  return {
    configId: undefined,
    current: legacy.currentModelId,
    models: legacy.availableModels.map((m) => toModel({ id: m.modelId, name: m.name, description: m.description })),
  };
}

export function modelsOf(response, keep) {
  const catalog = catalogOf(response);

  return catalog ? latestModels(catalog.models, keep ?? catalog.current) : [];
}

export function effortLevelsOf(configOptions) {
  const option = effortOption(configOptions);

  if (!option?.options) return [];

  return option.options
    .filter((o) => o.value !== DEFAULT_MODEL)
    .map((o) => ({ id: o.value, name: LEVEL_NAMES[o.value] ?? o.name }));
}

export class SessionModels {
  constructor() {
    this.reset();
  }

  reset() {
    this.models = [];
    this.levels = new Map();
    this.modelConfigId = undefined;
    this.effortConfigId = undefined;
    this.defaultModel = undefined;
    this.defaultEffort = undefined;
    this.current = new Map();
  }

  get available() {
    return this.models.map((m) => ({ ...m, effortLevels: this.levels.get(m.id) ?? [] }));
  }

  get canSetModel() {
    return this.models.length > 0;
  }

  get usesConfigOptions() {
    return this.modelConfigId !== undefined;
  }

  record(sessionId, response) {
    const catalog = catalogOf(response);
    const effort = effortOption(response?.configOptions);

    if (catalog) this.recordCatalog(catalog);

    if (effort) this.effortConfigId = effort.id;

    if (effort?.currentValue && effort.currentValue !== DEFAULT_MODEL) this.defaultEffort ??= effort.currentValue;

    if (!catalog?.current) return;

    this.levels.set(catalog.current, effortLevelsOf(response?.configOptions));
    this.current.set(sessionId, { model: catalog.current, effort: effort?.currentValue });
  }

  recordCatalog(catalog) {
    this.defaultModel ??= catalog.current;
    this.models = latestModels(catalog.models, this.defaultModel);

    if (catalog.configId) this.modelConfigId = catalog.configId;
  }

  switched(sessionId, model) {
    this.current.set(sessionId, { ...this.current.get(sessionId), model });

    if (!this.usesConfigOptions) this.levels.set(model, []);
  }

  unlearned() {
    if (!this.usesConfigOptions) return [];

    return this.models.filter((m) => !this.levels.has(m.id)).map((m) => m.id);
  }

  modelOf(sessionId) {
    return this.current.get(sessionId)?.model;
  }

  effortOf(sessionId) {
    return this.current.get(sessionId)?.effort;
  }

  forget(sessionId) {
    this.current.delete(sessionId);
  }

  clear() {
    this.current.clear();
  }

  pendingModel(sessionId, wanted) {
    if (!wanted || !this.models.some((m) => m.id === wanted)) return undefined;

    return this.modelOf(sessionId) === wanted ? undefined : wanted;
  }

  pendingEffort(sessionId, wanted) {
    const session = this.current.get(sessionId);

    if (!wanted || !session || !this.effortConfigId || session.effort === wanted) return undefined;

    return this.levels.get(session.model)?.some((l) => l.id === wanted) ? wanted : undefined;
  }
}

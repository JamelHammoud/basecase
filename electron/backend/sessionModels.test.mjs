import { describe, expect, it } from 'vitest';
import { latestModels } from './modelFamilies.mjs';
import { modelsOf, SessionModels } from './sessionModels.mjs';

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

const CLAUDE_MODELS = [
  { value: 'default', name: 'Default (recommended)', description: 'Opus 5.5' },
  { value: 'opus', name: 'Opus 5.5' },
  { value: 'fable', name: 'Fable 5.1' },
  { value: 'sonnet', name: 'Sonnet 5.5' },
  { value: 'haiku', name: 'Haiku 5.5' },
  { value: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' },
  { value: 'claude-sonnet-5', name: 'Sonnet 5' },
  { value: 'claude-opus-5', name: 'Opus 5' },
  { value: 'claude-fable-5', name: 'Fable 5' },
  { value: 'claude-opus-4-8', name: 'Opus 4.8' },
];

const CODEX_MODELS = [
  { value: 'gpt-6.1-sol', name: '6.1 Sol' },
  { value: 'gpt-6-astra', name: '6 Astra' },
  { value: 'gpt-6-sol', name: '6 Sol' },
  { value: 'gpt-6-luna', name: '6 Luna' },
  { value: 'gpt-5.6-sol', name: '5.6 Sol' },
  { value: 'gpt-5.6-terra', name: '5.6 Terra' },
  { value: 'gpt-5.6-luna', name: '5.6 Luna' },
];

const selectOption = (id, currentValue, options, category) => ({ id, type: 'select', category, currentValue, options });

const effort = (id, current, levels) =>
  selectOption(
    id,
    current,
    levels.map((l) => ({ value: l, name: l })),
    'thought_level',
  );

const claudeSession = ({ model = 'default', current = 'xhigh', levels = LEVELS } = {}) => ({
  configOptions: [
    selectOption('mode', 'default', []),
    selectOption('model', model, CLAUDE_MODELS, 'model'),
    ...(levels.length ? [effort('effort', current, ['default', ...levels])] : []),
  ],
});

const codexSession = ({ model = 'gpt-6-astra', current = 'high' } = {}) => ({
  configOptions: [
    selectOption('mode', 'read-only', []),
    selectOption('model', model, CODEX_MODELS, 'model'),
    effort('reasoning_effort', current, [...LEVELS, 'ultra']),
  ],
  models: { currentModelId: `${model}[${current}]`, availableModels: [] },
});

const geminiSession = {
  models: {
    currentModelId: 'auto',
    availableModels: [
      { modelId: 'auto', name: 'Auto' },
      { modelId: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
      { modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
      { modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
  },
};

const ids = (models) => models.map((m) => m.id);

describe('newest models', () => {
  it('keeps the newest model of each family in the newest generation', () => {
    expect(ids(modelsOf(claudeSession()))).toEqual(['default', 'opus', 'fable', 'sonnet', 'haiku']);
    expect(ids(modelsOf(codexSession()))).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna']);
    expect(ids(modelsOf(geminiSession))).toEqual(['auto', 'gemini-3-pro-preview', 'gemini-3-flash-preview']);
  });

  it('keeps the model a session started on, even when it is older', () => {
    expect(ids(modelsOf(codexSession({ model: 'gpt-6-sol' })))).toContain('gpt-6-sol');
  });

  it('leaves unversioned lists alone', () => {
    const models = [
      { id: 'a', name: 'Fast' },
      { id: 'b', name: 'Smart' },
    ];

    expect(latestModels(models)).toEqual(models);
  });

  it('names Default after the model it runs', () => {
    expect(modelsOf(claudeSession())[0]).toEqual({ id: 'default', name: 'Default', resolvesTo: 'Opus 5.5' });
  });
});

describe('session models', () => {
  it('learns effort levels per model as a Claude session switches', () => {
    const models = new SessionModels();

    models.record('s1', claudeSession());

    expect(models.unlearned()).toEqual(['opus', 'fable', 'sonnet', 'haiku']);

    for (const model of ['opus', 'fable', 'sonnet']) models.record('s1', claudeSession({ model }));

    models.record('s1', claudeSession({ model: 'haiku', levels: [] }));

    expect(models.unlearned()).toEqual([]);
    expect(models.defaultModel).toBe('default');
    expect(models.defaultEffort).toBe('xhigh');
    expect(models.available.find((m) => m.id === 'opus').effortLevels.map((l) => l.name)).toEqual([
      'low',
      'medium',
      'high',
      'Extra high',
      'max',
    ]);
    expect(models.available.find((m) => m.id === 'haiku').effortLevels).toEqual([]);
  });

  it("uses Codex's own option ids for model and effort", () => {
    const models = new SessionModels();

    models.record('s1', codexSession());

    expect(models.modelConfigId).toBe('model');
    expect(models.effortConfigId).toBe('reasoning_effort');
    expect(models.defaultModel).toBe('gpt-6-astra');
    expect(models.pendingModel('s1', 'gpt-6.1-sol')).toBe('gpt-6.1-sol');
    expect(models.pendingEffort('s1', 'ultra')).toBe('ultra');
    expect(models.pendingEffort('s1', 'high')).toBeUndefined();
  });

  it('switches Gemini models through the session model list, with no effort levels', () => {
    const models = new SessionModels();

    models.record('s1', geminiSession);

    expect(models.usesConfigOptions).toBe(false);
    expect(models.unlearned()).toEqual([]);
    expect(models.pendingModel('s1', 'gemini-3-pro-preview')).toBe('gemini-3-pro-preview');

    models.switched('s1', 'gemini-3-pro-preview');

    expect(models.pendingModel('s1', 'gemini-3-pro-preview')).toBeUndefined();
    expect(models.pendingEffort('s1', 'high')).toBeUndefined();
  });

  it('leaves the session alone when nothing is chosen or the choice is gone', () => {
    const models = new SessionModels();

    models.record('s1', claudeSession());

    expect(models.pendingModel('s1', undefined)).toBeUndefined();
    expect(models.pendingModel('s1', 'retired-model')).toBeUndefined();
    expect(models.pendingEffort('s1', undefined)).toBeUndefined();
  });

  it('leaves agents without a model list alone', () => {
    const models = new SessionModels();

    models.record('s1', { sessionId: 's1' });

    expect(models.available).toEqual([]);
    expect(models.pendingModel('s1', 'sonnet')).toBeUndefined();
  });
});

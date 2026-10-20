export class ModelControl {
  constructor({ models, connection, emit }) {
    this.models = models;
    this.connection = connection;
    this.emit = emit;
    this.learning = Promise.resolve();
  }

  async setOption(sessionId, configId, value) {
    try {
      this.models.record(sessionId, await this.connection().setSessionConfigOption({ sessionId, configId, value }));

      return true;
    } catch (err) {
      this.emit({ type: 'acp-stderr', text: `Couldn't set ${configId} to ${value}: ${err?.message ?? err}` });

      return false;
    }
  }

  async setModel(sessionId, model) {
    if (this.models.usesConfigOptions) return this.setOption(sessionId, this.models.modelConfigId, model);

    try {
      await this.connection().unstable_setSessionModel({ sessionId, modelId: model });
      this.models.switched(sessionId, model);

      return true;
    } catch (err) {
      this.emit({ type: 'acp-stderr', text: `Couldn't switch to ${model}: ${err?.message ?? err}` });

      return false;
    }
  }

  async learn(sessionId) {
    const model = this.models.modelOf(sessionId);
    const effort = this.models.effortOf(sessionId);
    const unlearned = this.models.unlearned();

    if (!model || !unlearned.length) return;

    for (const id of unlearned) await this.setModel(sessionId, id);

    await this.setModel(sessionId, model);

    if (effort && this.models.effortOf(sessionId) !== effort) {
      await this.setOption(sessionId, this.models.effortConfigId, effort);
    }
  }

  startLearning(sessionId) {
    this.learning = this.learn(sessionId);

    return this.learning;
  }

  async apply(sessionId, { model, effort }) {
    await this.learning;

    const targetModel = this.models.pendingModel(sessionId, model);

    if (targetModel) await this.setModel(sessionId, targetModel);

    const targetEffort = this.models.pendingEffort(sessionId, effort);

    if (targetEffort) await this.setOption(sessionId, this.models.effortConfigId, targetEffort);
  }
}

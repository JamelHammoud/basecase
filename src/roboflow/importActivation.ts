export class ImportActivation {
  private generation = 0;

  start() {
    const generation = ++this.generation;

    return () => this.generation === generation;
  }

  cancel() {
    this.generation++;
  }
}

export class Symbols {
  readonly list: string[];
  private readonly index = new Map<string, number>();

  constructor(initial: readonly string[] = []) {
    this.list = [...initial];

    initial.forEach((text, index) => {
      if (!this.index.has(text)) this.index.set(text, index);
    });
  }

  id(text: string): number {
    const known = this.index.get(text);

    if (known !== undefined) return known;

    this.index.set(text, this.list.length);
    this.list.push(text);

    return this.list.length - 1;
  }
}

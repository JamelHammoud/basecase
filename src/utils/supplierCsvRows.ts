const MAX_ROWS = 501;
const MAX_COLUMNS = 15;

class CsvReader {
  rows: string[][] = [];
  row: string[] = [];
  cell = '';
  quoted = false;
  closed = false;

  delimiter(ch: string) {
    this.row.push(this.cell);
    this.cell = '';
    this.closed = false;

    if (this.row.length > MAX_COLUMNS) throw new Error('Check the CSV column count.');

    if (ch !== '\n') return;

    this.rows.push(this.row);
    this.row = [];

    if (this.rows.length > MAX_ROWS) throw new Error('Use at most 500 offers.');
  }

  read(ch: string, next: string): boolean {
    if (this.quoted && ch === '"' && next === '"') {
      this.cell += '"';

      return true;
    }

    if (ch === '"' && !this.closed && (this.quoted || !this.cell)) {
      this.quoted = !this.quoted;
      this.closed = !this.quoted;

      return false;
    }

    if (!this.quoted && (ch === ',' || ch === '\n')) {
      this.delimiter(ch);

      return false;
    }

    if (!this.quoted && (this.closed || ch === '"')) throw new Error('Check the CSV quotes.');

    this.cell += ch;

    return false;
  }

  finish() {
    if (this.quoted) throw new Error('Close the CSV quotes.');

    if (this.cell || this.row.length) this.delimiter('\n');

    return this.rows;
  }
}

export function supplierCsvRows(text: string): string[][] {
  const reader = new CsvReader();

  for (let i = 0; i < text.length; i++) {
    if (reader.read(text[i], text[i + 1])) i++;
  }

  return reader.finish();
}

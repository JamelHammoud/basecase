export function parseBomCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"' && quoted && text[i + 1] === '"') {
      value += '"';
      i++;

      continue;
    }

    if (char === '"') {
      quoted = !quoted;

      continue;
    }

    if (!quoted && char === ',') {
      row.push(value);
      value = '';

      continue;
    }

    if (!quoted && char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';

      continue;
    }

    value += char;
  }

  if (quoted || row.length || value) throw new Error('Incomplete CSV record');

  const [header, ...records] = rows;

  return records.map((cells) => {
    if (cells.length !== header.length) throw new Error('CSV column count differs');

    return Object.fromEntries(header.map((name, index) => [name, cells[index]]));
  });
}

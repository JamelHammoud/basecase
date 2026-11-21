export function editDistance(a, b) {
  const columns = a.length < b.length ? a : b;
  const rows = a.length < b.length ? b : a;

  if (!columns.length) return rows.length;

  const row = Array.from({ length: columns.length + 1 }, (_, i) => i);

  for (let i = 1; i <= rows.length; i++) {
    let diagonal = row[0];

    row[0] = i;

    for (let j = 1; j <= columns.length; j++) {
      const above = row[j];

      row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + Number(rows[i - 1] !== columns[j - 1]));
      diagonal = above;
    }
  }

  return row[columns.length];
}

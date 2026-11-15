export interface WindingRow {
  at: ArrayLike<number>;
  inside: ArrayLike<number>;
}

export function insideBefore(row: WindingRow, x: number): boolean {
  let low = 0;
  let high = row.at.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);

    if (row.at[mid] < x) low = mid + 1;
    else high = mid;
  }

  return row.inside[low] !== 0;
}

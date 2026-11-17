export function maskRowLeft(data: Uint8Array, offset: number, left: number, right: number): number {
  for (let x = left; x <= right; x++) {
    if (data[offset + x]) return x;
  }

  return -1;
}

export function maskRowRight(data: Uint8Array, offset: number, right: number, occupiedLeft: number): number {
  if (!Number.isInteger(occupiedLeft)) return fractionalRowRight(data, offset, right, occupiedLeft);

  for (let x = right; x > occupiedLeft; x--) {
    if (data[offset + x]) return x;
  }

  return occupiedLeft;
}

function fractionalRowRight(data: Uint8Array, offset: number, right: number, occupiedLeft: number): number {
  let last = occupiedLeft;

  for (let x = occupiedLeft + 1; x <= right; x++) {
    if (data[offset + x]) last = x;
  }

  return last;
}

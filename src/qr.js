/** Deterministic fake QR matrix for tutorial display */
export function generateQrMatrix(address, size = 25) {
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  let seed = 0;
  const str = String(address || '0x');
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  // finder patterns
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (edge || center) matrix[r0 + r][c0 + c] = true;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) continue;
      if (rand() > 0.55) matrix[r][c] = true;
    }
  }
  return matrix;
}

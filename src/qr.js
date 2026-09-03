// Generate a deterministic pseudo-random QR code matrix for any given address string
// This creates realistic-looking authentic QR code patterns without external heavy libraries
export function generateQrMatrix(address, size = 25)[][] {
  const matrix[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper to draw a position detection square (standard QR corners)
  const drawPositionSquare = (row, col) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 || // Outer frame
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)      // Inner solid 3x3
        ) {
          matrix[row + r][col + c] = true;
        } else {
          matrix[row + r][col + c] = false;
        }
      }
    }
  };

  // Top-left, top-right, bottom-left finder patterns
  drawPositionSquare(0, 0);
  drawPositionSquare(0, size - 7);
  drawPositionSquare(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Hash address to fill data modules deterministically
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }

  let seed = Math.abs(hash);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Don't overwrite corner finder patterns or separators
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8) ||
        (r === 6 || c === 6)
      ) {
        continue;
      }

      seed = (seed * 9301 + 49297) % 233280;
      matrix[r][c] = (seed / 233280) > 0.48;
    }
  }

  return matrix;
}

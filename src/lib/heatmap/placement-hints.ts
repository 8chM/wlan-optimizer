/**
 * AP Placement Hints - Finds weak coverage areas and suggests positions for new APs.
 *
 * Analyzes heatmap RSSI data to identify "dead zones" (areas with RSSI below a threshold)
 * and calculates centroids as suggested placement positions.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface PlacementHint {
  /** Suggested X position in meters */
  xM: number;
  /** Suggested Y position in meters */
  yM: number;
  /** Area of the weak zone in grid cells */
  areaCells: number;
  /** Average RSSI in the weak zone (dBm) */
  avgRssi: number;
  /** Reason for the suggestion */
  reason: string;
}

export interface PlacementHintOptions {
  /** RSSI threshold below which coverage is "weak" (default: -80 dBm) */
  weakThreshold?: number;
  /** Minimum area (in grid cells) for a zone to be flagged (default: 10) */
  minAreaCells?: number;
  /** Maximum number of hints to return (default: 5) */
  maxHints?: number;
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_WEAK_THRESHOLD = -80;
const DEFAULT_MIN_AREA = 10;
const DEFAULT_MAX_HINTS = 5;

// ─── Functions ──────────────────────────────────────────────────

/**
 * Find weak coverage zones and suggest AP placement positions.
 *
 * @param rssiGrid - 2D array of RSSI values (grid[row][col]) or flat Float32Array
 * @param gridWidth - Number of columns in the grid
 * @param gridHeight - Number of rows in the grid
 * @param gridResolutionM - Meters per grid cell
 * @param options - Configuration options
 * @param originX - X-offset of the grid origin in meters (default: 0)
 * @param originY - Y-offset of the grid origin in meters (default: 0)
 * @returns Array of placement hints sorted by zone area (largest first)
 */
export function findPlacementHints(
  rssiGrid: number[][] | Float32Array,
  gridWidth: number,
  gridHeight: number,
  gridResolutionM: number,
  options: PlacementHintOptions = {},
  originX = 0,
  originY = 0,
): PlacementHint[] {
  const threshold = options.weakThreshold ?? DEFAULT_WEAK_THRESHOLD;
  const minArea = options.minAreaCells ?? DEFAULT_MIN_AREA;
  const maxHints = options.maxHints ?? DEFAULT_MAX_HINTS;

  // Build a visited grid and a weak-cell mask
  const isWeak = new Uint8Array(gridWidth * gridHeight);
  const visited = new Uint8Array(gridWidth * gridHeight);

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      const rssi = getRssi(rssiGrid, row, col, gridWidth);
      if (rssi < threshold) {
        isWeak[idx] = 1;
      }
    }
  }

  // Flood-fill to find connected weak regions
  const regions: { cells: number[]; totalRssi: number }[] = [];

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      if (isWeak[idx] && !visited[idx]) {
        const region = floodFill(
          isWeak, visited, row, col, gridWidth, gridHeight, rssiGrid,
        );
        if (region.cells.length >= minArea) {
          regions.push(region);
        }
      }
    }
  }

  // Sort by area (largest weak zones first)
  regions.sort((a, b) => b.cells.length - a.cells.length);

  // Convert to placement hints (centroid of each region)
  const hints: PlacementHint[] = [];
  for (const region of regions.slice(0, maxHints)) {
    let sumX = 0;
    let sumY = 0;

    for (const cellIdx of region.cells) {
      const row = Math.floor(cellIdx / gridWidth);
      const col = cellIdx % gridWidth;
      sumX += col;
      sumY += row;
    }

    const centroidCol = sumX / region.cells.length;
    const centroidRow = sumY / region.cells.length;
    const avgRssi = region.totalRssi / region.cells.length;

    hints.push({
      xM: originX + centroidCol * gridResolutionM,
      yM: originY + centroidRow * gridResolutionM,
      areaCells: region.cells.length,
      avgRssi,
      reason: `Weak zone (avg ${avgRssi.toFixed(0)} dBm, ${region.cells.length} cells)`,
    });
  }

  return hints;
}

/**
 * Get RSSI value from grid (supports both 2D array and flat Float32Array).
 */
function getRssi(
  grid: number[][] | Float32Array,
  row: number,
  col: number,
  width: number,
): number {
  if (grid instanceof Float32Array) {
    return grid[row * width + col] ?? -100;
  }
  return grid[row]?.[col] ?? -100;
}

/**
 * BFS flood fill to find a connected weak region.
 */
function floodFill(
  isWeak: Uint8Array,
  visited: Uint8Array,
  startRow: number,
  startCol: number,
  width: number,
  height: number,
  rssiGrid: number[][] | Float32Array,
): { cells: number[]; totalRssi: number } {
  const cells: number[] = [];
  let totalRssi = 0;
  const queue: number[] = [startRow * width + startCol];
  visited[startRow * width + startCol] = 1;

  const dx = [0, 0, 1, -1];
  const dy = [1, -1, 0, 0];

  while (queue.length > 0) {
    const idx = queue.shift()!;
    cells.push(idx);

    const row = Math.floor(idx / width);
    const col = idx % width;
    totalRssi += getRssi(rssiGrid, row, col, width);

    for (let d = 0; d < 4; d++) {
      const nr = row + dy[d]!;
      const nc = col + dx[d]!;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
        const nIdx = nr * width + nc;
        if (isWeak[nIdx] && !visited[nIdx]) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  return { cells, totalRssi };
}

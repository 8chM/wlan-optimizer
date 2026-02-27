/**
 * Pixel-by-pixel difference calculation between two heatmap canvases.
 *
 * Produces a difference canvas where:
 * - Green = improved signal (canvas B stronger than A)
 * - Red = degraded signal (canvas B weaker than A)
 * - Gray/transparent = unchanged
 */

// ─── Types ──────────────────────────────────────────────────────

export interface DifferenceResult {
  /** The difference canvas (green = improved, red = degraded) */
  canvas: HTMLCanvasElement;
  /** Number of improved pixels */
  improvedCount: number;
  /** Number of degraded pixels */
  degradedCount: number;
  /** Number of unchanged pixels */
  unchangedCount: number;
  /** Average improvement in dB-equivalent units */
  avgDeltaDb: number;
}

// ─── Constants ──────────────────────────────────────────────────

/** Minimum perceived brightness change to count as different */
const CHANGE_THRESHOLD = 8;

// ─── Functions ──────────────────────────────────────────────────

/**
 * Extract luminance-like value from an RGBA pixel.
 * Heatmap pixels encode signal strength in color:
 * warmer (red/yellow) = stronger, cooler (blue/purple) = weaker.
 * We use a weighted sum that maps heatmap colors to a "signal proxy" value.
 */
function pixelSignalProxy(r: number, g: number, b: number, a: number): number {
  if (a < 10) return 0; // transparent = no signal
  // Green and red indicate stronger signal in typical heatmap schemes
  return 0.3 * r + 0.5 * g + 0.2 * b;
}

/**
 * Compute pixel-by-pixel difference between two heatmap canvases.
 *
 * @param canvasA - The "before" heatmap canvas
 * @param canvasB - The "after" heatmap canvas
 * @returns DifferenceResult with the diff canvas and statistics
 */
export function computeHeatmapDifference(
  canvasA: HTMLCanvasElement,
  canvasB: HTMLCanvasElement,
): DifferenceResult {
  const width = Math.min(canvasA.width, canvasB.width);
  const height = Math.min(canvasA.height, canvasB.height);

  const ctxA = canvasA.getContext('2d');
  const ctxB = canvasB.getContext('2d');

  if (!ctxA || !ctxB) {
    throw new Error('Cannot get 2D context from canvas');
  }

  const dataA = ctxA.getImageData(0, 0, width, height);
  const dataB = ctxB.getImageData(0, 0, width, height);

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const ctxDiff = diffCanvas.getContext('2d')!;
  const diffData = ctxDiff.createImageData(width, height);

  let improvedCount = 0;
  let degradedCount = 0;
  let unchangedCount = 0;
  let totalDelta = 0;
  let signalPixels = 0;

  for (let i = 0; i < dataA.data.length; i += 4) {
    const rA = dataA.data[i]!;
    const gA = dataA.data[i + 1]!;
    const bA = dataA.data[i + 2]!;
    const aA = dataA.data[i + 3]!;

    const rB = dataB.data[i]!;
    const gB = dataB.data[i + 1]!;
    const bB = dataB.data[i + 2]!;
    const aB = dataB.data[i + 3]!;

    const sigA = pixelSignalProxy(rA, gA, bA, aA);
    const sigB = pixelSignalProxy(rB, gB, bB, aB);
    const delta = sigB - sigA;

    // Skip pixels where both have no signal
    if (aA < 10 && aB < 10) {
      diffData.data[i] = 0;
      diffData.data[i + 1] = 0;
      diffData.data[i + 2] = 0;
      diffData.data[i + 3] = 0;
      unchangedCount++;
      continue;
    }

    signalPixels++;
    totalDelta += delta;

    if (delta > CHANGE_THRESHOLD) {
      // Improved: green
      const intensity = Math.min(255, Math.round(Math.abs(delta) * 2));
      diffData.data[i] = 0;
      diffData.data[i + 1] = intensity;
      diffData.data[i + 2] = 0;
      diffData.data[i + 3] = Math.min(200, intensity + 50);
      improvedCount++;
    } else if (delta < -CHANGE_THRESHOLD) {
      // Degraded: red
      const intensity = Math.min(255, Math.round(Math.abs(delta) * 2));
      diffData.data[i] = intensity;
      diffData.data[i + 1] = 0;
      diffData.data[i + 2] = 0;
      diffData.data[i + 3] = Math.min(200, intensity + 50);
      degradedCount++;
    } else {
      // Unchanged: subtle gray
      diffData.data[i] = 128;
      diffData.data[i + 1] = 128;
      diffData.data[i + 2] = 128;
      diffData.data[i + 3] = 30;
      unchangedCount++;
    }
  }

  ctxDiff.putImageData(diffData, 0, 0);

  // Scale delta to approximate dB equivalent (rough conversion)
  const avgDeltaDb = signalPixels > 0 ? (totalDelta / signalPixels) * 0.3 : 0;

  return {
    canvas: diffCanvas,
    improvedCount,
    degradedCount,
    unchangedCount,
    avgDeltaDb,
  };
}

/**
 * Create a snapshot (clone) of a heatmap canvas.
 */
export function snapshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const clone = document.createElement('canvas');
  clone.width = source.width;
  clone.height = source.height;
  const ctx = clone.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }
  return clone;
}

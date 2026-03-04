/**
 * Quick simulation engine for before/after comparisons.
 *
 * Runs RF calculations on the main thread with a coarse grid (1.0m step)
 * for fast (~5ms) score comparisons when evaluating recommendation candidates.
 *
 * Imports the same RF engine used by the heatmap worker.
 */

import { computeRSSI, computeUplinkRSSI, createRFConfig } from '$lib/heatmap/rf-engine';
import type { RFConfig } from '$lib/heatmap/rf-engine';
import { buildSpatialGrid } from '$lib/heatmap/spatial-grid';
import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import { BAND_THRESHOLDS } from '$lib/heatmap/coverage-stats';
import type {
  APModification,
  SimulatedDelta,
  ScoringWeights,
  CoverageBinPercents,
} from './types';

/** Coarse grid step for quick simulation (meters) */
const SIM_GRID_STEP = 1.0;

// ─── Before-Grid Cache ──────────────────────────────────────────

let cachedBeforeKey = '';
let cachedBeforeBins: CoverageBinPercents | null = null;

function getBeforeGridKey(aps: APConfig[], bounds: FloorBounds, band: FrequencyBand): string {
  return aps.map(a => `${a.id}:${a.x}:${a.y}:${a.txPowerDbm}:${a.orientationDeg}:${a.mounting}`)
    .join('|') + `|${band}|${bounds.width}x${bounds.height}`;
}

/** Clear the before-grid cache (call at start of each analysis run). */
export function clearSimulatorCache(): void {
  cachedBeforeKey = '';
  cachedBeforeBins = null;
}

/** Get cached or compute before-grid bins. */
function getCachedBeforeBins(
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
): CoverageBinPercents {
  const key = getBeforeGridKey(aps, bounds, band);
  if (key === cachedBeforeKey && cachedBeforeBins) {
    return cachedBeforeBins;
  }
  const bins = simulateGrid(aps, walls, bounds, band, rfConfig);
  cachedBeforeKey = key;
  cachedBeforeBins = bins;
  return bins;
}

/**
 * Compute a simple coverage score from bins.
 * Same formula as computeOverallScore coverage sub-score.
 */
export function scoreFromBins(
  bins: CoverageBinPercents,
  _weights: ScoringWeights,
): number {
  const total = bins.excellent + bins.good + bins.fair + bins.poor + bins.none;
  if (total === 0) return 0;
  const weighted = bins.excellent * 4 + bins.good * 3 + bins.fair * 2 + bins.poor * 1;
  return (weighted / (total * 4)) * 100;
}

/**
 * Run a quick RF simulation and return coverage bins as percentages.
 */
export function simulateGrid(
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
): CoverageBinPercents {
  const originX = bounds.originX ?? 0;
  const originY = bounds.originY ?? 0;
  const gridWidth = Math.max(1, Math.ceil(bounds.width / SIM_GRID_STEP) + 1);
  const gridHeight = Math.max(1, Math.ceil(bounds.height / SIM_GRID_STEP) + 1);
  const totalCells = gridWidth * gridHeight;

  const { grid: spatialGrid, allSegments } = buildSpatialGrid(walls, bounds.width, bounds.height, originX, originY);
  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];
  const activeAPs = aps.filter(ap => ap.enabled);

  let binExcellent = 0;
  let binGood = 0;
  let binFair = 0;
  let binPoor = 0;
  let binNone = 0;

  for (let gy = 0; gy < gridHeight; gy++) {
    const pointY = originY + gy * SIM_GRID_STEP;
    for (let gx = 0; gx < gridWidth; gx++) {
      const pointX = originX + gx * SIM_GRID_STEP;

      let bestRSSI = -Infinity;
      for (const ap of activeAPs) {
        const downlink = computeRSSI(pointX, pointY, ap, rfConfig, spatialGrid, allSegments);
        const uplink = computeUplinkRSSI(pointX, pointY, ap, band, rfConfig, spatialGrid, allSegments);
        const effective = Math.min(downlink, uplink);
        if (effective > bestRSSI) bestRSSI = effective;
      }
      if (bestRSSI === -Infinity) bestRSSI = -100;

      if (bestRSSI >= thresholds.excellent) binExcellent++;
      else if (bestRSSI >= thresholds.good) binGood++;
      else if (bestRSSI >= thresholds.fair) binFair++;
      else if (bestRSSI >= thresholds.poor) binPoor++;
      else binNone++;
    }
  }

  // Convert to percentages
  const pct = (n: number) => totalCells > 0 ? (n / totalCells) * 100 : 0;
  return {
    excellent: pct(binExcellent),
    good: pct(binGood),
    fair: pct(binFair),
    poor: pct(binPoor),
    none: pct(binNone),
  };
}

/**
 * Apply a modification to an AP config array, returning a new copy.
 */
function applyModification(aps: APConfig[], mod: APModification): APConfig[] {
  return aps.map(ap => {
    if (ap.id !== mod.apId) return ap;
    return {
      ...ap,
      x: mod.position?.x ?? ap.x,
      y: mod.position?.y ?? ap.y,
      orientationDeg: mod.orientationDeg ?? ap.orientationDeg,
      mounting: mod.mounting ?? ap.mounting,
      txPowerDbm: mod.txPowerDbm ?? ap.txPowerDbm,
    };
  });
}

/**
 * Simulate a change and return the before/after comparison.
 *
 * Runs two quick grid simulations (before and after) with coarse 1.0m grid.
 * For a typical 15×10m floor plan this means ~150 cells × N APs = fast.
 */
export function simulateChange(
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  modification: APModification,
  weights: ScoringWeights,
): SimulatedDelta {
  // Before (cached)
  const coverageBefore = getCachedBeforeBins(aps, walls, bounds, band, rfConfig);
  const scoreBefore = scoreFromBins(coverageBefore, weights);

  // After
  const modifiedAps = applyModification(aps, modification);
  const coverageAfter = simulateGrid(modifiedAps, walls, bounds, band, rfConfig);
  const scoreAfter = scoreFromBins(coverageAfter, weights);

  const changePercent = scoreBefore > 0
    ? ((scoreAfter - scoreBefore) / scoreBefore) * 100
    : scoreAfter > 0 ? 100 : 0;

  return {
    scoreBefore,
    scoreAfter,
    changePercent,
    coverageBefore,
    coverageAfter,
  };
}

/**
 * Simulate adding a new AP at a given position.
 */
export function simulateAddAP(
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  newApPosition: { x: number; y: number },
  templateAp: Partial<APConfig>,
  weights: ScoringWeights,
): SimulatedDelta {
  const coverageBefore = getCachedBeforeBins(aps, walls, bounds, band, rfConfig);
  const scoreBefore = scoreFromBins(coverageBefore, weights);

  const newAp: APConfig = {
    id: '__sim_new_ap__',
    x: newApPosition.x,
    y: newApPosition.y,
    txPowerDbm: templateAp.txPowerDbm ?? 20,
    antennaGainDbi: templateAp.antennaGainDbi ?? 4.0,
    enabled: true,
    mounting: templateAp.mounting ?? 'ceiling',
    orientationDeg: 0,
    heightM: templateAp.heightM ?? 2.5,
  };

  const coverageAfter = simulateGrid([...aps, newAp], walls, bounds, band, rfConfig);
  const scoreAfter = scoreFromBins(coverageAfter, weights);

  const changePercent = scoreBefore > 0
    ? ((scoreAfter - scoreBefore) / scoreBefore) * 100
    : scoreAfter > 0 ? 100 : 0;

  return {
    scoreBefore,
    scoreAfter,
    changePercent,
    coverageBefore,
    coverageAfter,
  };
}

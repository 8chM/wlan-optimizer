/**
 * HeatmapManager - Controls progressive heatmap rendering with 4 LOD levels.
 *
 * LOD levels:
 *   0: Drag mode     - gridStep 1.0m,  target <15ms
 *   1: Drag end      - gridStep 0.5m,  target <50ms,  debounce 150ms
 *   2: Idle           - gridStep 0.25m, target <200ms, debounce 300ms
 *   3: Max quality    - gridStep 0.1m,  target <500ms, export only
 *
 * The manager handles:
 * - Creating and terminating the Web Worker
 * - Debouncing recalculation requests
 * - Progressive LOD: coarse -> fine after interaction stops
 * - Request-ID matching to discard stale results
 * - Stats tracking (min/max/avg RSSI, calc time)
 */

import type {
  HeatmapWorkerRequest,
  HeatmapWorkerResponse,
  APConfig,
  WallData,
  FloorBounds,
} from './worker-types';
import type { FrequencyBand, ColorScheme } from './color-schemes';
import type { PlacementHint } from './placement-hints';

// ─── Types ─────────────────────────────────────────────────────────

/** Level of detail for heatmap rendering */
export type LODLevel = 0 | 1 | 2 | 3;

/** Statistics from a completed heatmap calculation */
export interface HeatmapStats {
  /** Minimum RSSI across the entire grid (dBm) */
  minRSSI: number;
  /** Maximum RSSI across the entire grid (dBm) */
  maxRSSI: number;
  /** Average RSSI across the entire grid (dBm) */
  avgRSSI: number;
  /** Wall-clock time for the calculation (ms) */
  calculationTimeMs: number;
  /** Grid step size used for this calculation (meters) */
  gridStep: number;
  /** LOD level used for this calculation */
  lodLevel: LODLevel;
  /** Coverage bins (signal quality distribution) */
  coverageBins?: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    none: number;
  };
  /** Total number of grid cells */
  totalCells?: number;
  /** AP placement hints for weak coverage zones */
  placementHints?: PlacementHint[];
}

/** Parameters required for a heatmap calculation */
export interface HeatmapParams {
  /** Access points to include */
  aps: APConfig[];
  /** Walls with attenuation data */
  walls: WallData[];
  /** Floor plan dimensions in meters */
  bounds: FloorBounds;
  /** Frequency band */
  band: FrequencyBand;
  /** Color scheme for visualization */
  colorScheme: ColorScheme;
  /** Output image width in pixels */
  outputWidth: number;
  /** Output image height in pixels */
  outputHeight: number;
  /** Calibrated path loss exponent (overrides default if set) */
  calibratedN?: number;
  /** Receiver gain in dBi (overrides default if set) */
  receiverGainDbi?: number;
}

/** Callback options for HeatmapManager */
export interface HeatmapManagerOptions {
  /** Called when a calculation completes with the rendered canvas and stats */
  onResult: (canvas: HTMLCanvasElement, stats: HeatmapStats) => void;
  /** Called when an error occurs during calculation */
  onError?: (message: string) => void;
}

// ─── Constants ─────────────────────────────────────────────────────

/** Grid step sizes for each LOD level (meters) */
const LOD_GRID_STEPS: Record<LODLevel, number> = {
  0: 1.0,   // Drag mode: coarse, instant feedback
  1: 0.5,   // Drag end: medium, fast refinement
  2: 0.25,  // Idle: fine, good quality
  3: 0.1,   // Max quality: very fine, export/final
};

/** Debounce delays for progressive LOD transitions (ms) */
const LOD_DEBOUNCE_MS: Record<LODLevel, number> = {
  0: 0,     // Immediate
  1: 150,   // Short pause after drag ends
  2: 300,   // Longer pause for idle refinement
  3: 0,     // Max quality is explicitly requested
};

// ─── HeatmapManager Class ──────────────────────────────────────────

export class HeatmapManager {
  private worker: Worker | null = null;
  private options: HeatmapManagerOptions;

  /** Incrementing request ID for matching responses to requests */
  private nextRequestId = 0;

  /** The request ID of the most recently sent request */
  private latestRequestId = 0;

  /** Whether a calculation is currently in flight */
  private calculating = false;

  /** Timer IDs for debounced LOD transitions */
  private debounceTimers: Map<LODLevel, ReturnType<typeof setTimeout>> = new Map();

  /** Whether the manager has been destroyed */
  private destroyed = false;

  constructor(options: HeatmapManagerOptions) {
    this.options = options;
    this.initWorker();
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Request a heatmap calculation at a specific LOD level.
   * If a calculation at this LOD or lower is already pending/running,
   * this may be debounced or replace the pending request.
   */
  requestUpdate(params: HeatmapParams, lod: LODLevel): void {
    if (this.destroyed) return;

    const debounceMs = LOD_DEBOUNCE_MS[lod];

    if (debounceMs === 0) {
      this.sendCalculation(params, lod);
    } else {
      // Cancel any existing debounce for this LOD level
      this.cancelDebounceTimer(lod);

      const timer = setTimeout(() => {
        this.debounceTimers.delete(lod);
        this.sendCalculation(params, lod);
      }, debounceMs);

      this.debounceTimers.set(lod, timer);
    }
  }

  /**
   * Start a progressive render sequence: LOD 0 immediately, then
   * LOD 1 and LOD 2 with their respective debounce delays.
   * Each successive LOD replaces the previous result.
   */
  requestProgressive(params: HeatmapParams): void {
    if (this.destroyed) return;

    // Cancel any pending progressive timers
    this.cancelAllDebounceTimers();

    // LOD 0: immediate coarse render
    this.sendCalculation(params, 0);

    // LOD 1: after short debounce
    const timer1 = setTimeout(() => {
      this.debounceTimers.delete(1);
      this.sendCalculation(params, 1);
    }, LOD_DEBOUNCE_MS[1]);
    this.debounceTimers.set(1, timer1);

    // LOD 2: after longer debounce
    const timer2 = setTimeout(() => {
      this.debounceTimers.delete(2);
      this.sendCalculation(params, 2);
    }, LOD_DEBOUNCE_MS[1] + LOD_DEBOUNCE_MS[2]);
    this.debounceTimers.set(2, timer2);
  }

  /**
   * Request a full quality (LOD 3) render. Typically used for export
   * or when the user explicitly requests maximum quality.
   */
  requestMaxQuality(params: HeatmapParams): void {
    if (this.destroyed) return;

    // Cancel any pending progressive timers
    this.cancelAllDebounceTimers();

    this.sendCalculation(params, 3);
  }

  /**
   * Cancel all pending debounced calculations.
   * Does not cancel an in-flight worker computation, but its result
   * will be discarded when a newer request arrives.
   */
  cancelPending(): void {
    this.cancelAllDebounceTimers();
  }

  /**
   * Terminate the worker and clean up all resources.
   * The manager cannot be used after calling destroy().
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.cancelAllDebounceTimers();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /** Whether a calculation is currently in progress */
  get isCalculating(): boolean {
    return this.calculating;
  }

  // ─── Internal Methods ──────────────────────────────────────────

  /** Creates and configures the Web Worker */
  private initWorker(): void {
    this.worker = new Worker(
      new URL('./heatmap-worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (event: MessageEvent<HeatmapWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (err: ErrorEvent) => {
      this.calculating = false;
      this.options.onError?.(err.message ?? 'Worker error');
    };
  }

  /** Map of request ID to LOD info for pending calculations */
  private pendingLodInfo = new Map<number, { lod: LODLevel; gridStep: number }>();

  /** Sends a calculation request to the worker */
  private sendCalculation(params: HeatmapParams, lod: LODLevel): void {
    if (!this.worker || this.destroyed) return;

    this.nextRequestId += 1;
    this.latestRequestId = this.nextRequestId;
    this.calculating = true;

    const gridStep = LOD_GRID_STEPS[lod];

    // Store LOD info so we can attach it to the result later
    this.pendingLodInfo.set(this.latestRequestId, { lod, gridStep });

    const request: HeatmapWorkerRequest = {
      type: 'calculate',
      id: this.latestRequestId,
      aps: params.aps,
      walls: params.walls,
      bounds: params.bounds,
      gridStep,
      outputWidth: params.outputWidth,
      outputHeight: params.outputHeight,
      band: params.band,
      colorScheme: params.colorScheme,
      calibratedN: params.calibratedN,
      receiverGainDbi: params.receiverGainDbi,
    };

    this.worker.postMessage(request);
  }

  /** Handles worker response messages */
  private handleWorkerMessage(response: HeatmapWorkerResponse): void {
    if (this.destroyed) return;

    switch (response.type) {
      case 'result': {
        // Discard stale results from older requests
        if (response.id < this.latestRequestId) {
          this.pendingLodInfo.delete(response.id);
          // Reset calculating flag if no more pending requests
          if (this.pendingLodInfo.size === 0) {
            this.calculating = false;
          }
          return;
        }

        this.calculating = false;

        // Look up LOD info for this request
        const lodInfo = this.pendingLodInfo.get(response.id);
        this.pendingLodInfo.delete(response.id);

        // Create canvas from the ArrayBuffer result
        const canvas = this.bufferToCanvas(
          response.buffer,
          response.width,
          response.height,
        );

        if (!canvas) {
          this.options.onError?.('Failed to create canvas from result buffer');
          return;
        }

        const stats: HeatmapStats = {
          minRSSI: response.stats.minRSSI,
          maxRSSI: response.stats.maxRSSI,
          avgRSSI: response.stats.avgRSSI,
          calculationTimeMs: response.calculationTimeMs,
          gridStep: lodInfo?.gridStep ?? 0.25,
          lodLevel: lodInfo?.lod ?? 2,
          coverageBins: response.stats.coverageBins,
          totalCells: response.stats.totalCells,
          placementHints: response.stats.placementHints,
        };

        this.options.onResult(canvas, stats);
        break;
      }

      case 'progress': {
        // Progress updates can be used for loading indicators (future)
        break;
      }

      case 'error': {
        this.calculating = false;
        this.pendingLodInfo.delete(response.id);
        this.options.onError?.(response.message);
        break;
      }
    }
  }

  /**
   * Converts an RGBA ArrayBuffer to an HTMLCanvasElement.
   * Returns null if canvas context creation fails.
   */
  private bufferToCanvas(
    buffer: ArrayBuffer,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = new ImageData(
      new Uint8ClampedArray(buffer),
      width,
      height,
    );
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  /** Cancels a debounce timer for a specific LOD level */
  private cancelDebounceTimer(lod: LODLevel): void {
    const existing = this.debounceTimers.get(lod);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.debounceTimers.delete(lod);
    }
  }

  /** Cancels all pending debounce timers */
  private cancelAllDebounceTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

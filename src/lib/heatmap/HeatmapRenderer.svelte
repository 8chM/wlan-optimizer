<!--
  HeatmapRenderer.svelte - Manages the heatmap Web Worker and renders results.

  Features:
  - Debounced recalculation on AP/wall changes (100ms)
  - Progressive rendering: coarse grid (1m) first, fine grid (0.25m) after
  - Displays result as Konva.Image on the heatmap layer
-->
<script lang="ts">
  import { Image as KonvaImage } from 'svelte-konva';
  import type {
    HeatmapWorkerRequest,
    HeatmapWorkerResponse,
    APConfig,
    WallData,
    FloorBounds,
  } from './worker-types';
  import type { FrequencyBand, ColorScheme } from './color-schemes';

  // ─── Constants ─────────────────────────────────────────────────

  /** Debounce delay before triggering recalculation (ms) */
  const DEBOUNCE_MS = 100;

  /** Coarse grid step for fast initial render (meters) */
  const COARSE_GRID_STEP = 1.0;

  /** Fine grid step for high-quality render (meters) */
  const FINE_GRID_STEP = 0.25;

  // ─── Props ─────────────────────────────────────────────────────

  interface HeatmapRendererProps {
    /** Access points to include in calculation */
    aps: APConfig[];
    /** Walls with attenuation data */
    walls: WallData[];
    /** Floor dimensions in meters */
    bounds: FloorBounds;
    /** Frequency band to calculate */
    band?: FrequencyBand;
    /** Color scheme for visualization */
    colorScheme?: ColorScheme;
    /** Output image width in pixels */
    outputWidth?: number;
    /** Output image height in pixels */
    outputHeight?: number;
    /** Heatmap opacity (0-1) */
    opacity?: number;
    /** Whether the heatmap is visible */
    visible?: boolean;
    /** Calibrated path loss exponent (overrides default) */
    calibratedN?: number;
  }

  let {
    aps,
    walls,
    bounds,
    band = '5ghz',
    colorScheme = 'viridis',
    outputWidth = 800,
    outputHeight = 600,
    opacity = 0.65,
    visible = true,
    calibratedN = undefined,
  }: HeatmapRendererProps = $props();

  // ─── Internal State ────────────────────────────────────────────

  /** The current rendered heatmap as an HTMLCanvasElement (for Konva.Image) */
  let heatmapCanvas = $state<HTMLCanvasElement | null>(null);

  /** The Web Worker instance */
  let worker = $state<Worker | null>(null);

  /** Debounce timer ID */
  let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  /** Incrementing request ID for matching responses */
  let requestId = $state(0);

  /** Whether a fine calculation is currently pending */
  let fineCalculationPending = $state(false);

  /** Last calculation time in milliseconds */
  let lastCalcTimeMs = $state(0);

  // ─── Worker Lifecycle ──────────────────────────────────────────

  /**
   * Initializes the Web Worker on component mount.
   */
  $effect(() => {
    const w = new Worker(
      new URL('./heatmap-worker.ts', import.meta.url),
      { type: 'module' }
    );

    w.onmessage = handleWorkerMessage;
    w.onerror = (err) => {
      console.error('[HeatmapRenderer] Worker error:', err.message);
    };

    worker = w;

    // Cleanup on unmount
    return () => {
      w.terminate();
      worker = null;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
    };
  });

  // ─── Reactive Recalculation ────────────────────────────────────

  /**
   * Triggers recalculation whenever inputs change.
   * Uses debouncing to avoid excessive computation during rapid changes.
   */
  $effect(() => {
    // Track all reactive dependencies
    void aps;
    void walls;
    void bounds;
    void band;
    void colorScheme;
    void outputWidth;
    void outputHeight;
    void calibratedN;

    scheduleRecalculation();
  });

  /**
   * Schedules a debounced recalculation.
   * Fires a coarse calculation immediately, then queues a fine one.
   */
  function scheduleRecalculation(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    // Start coarse calculation immediately for "instant feel"
    requestCalculation(COARSE_GRID_STEP);

    // Schedule fine calculation after debounce period
    debounceTimer = setTimeout(() => {
      fineCalculationPending = true;
      requestCalculation(FINE_GRID_STEP);
      debounceTimer = null;
    }, DEBOUNCE_MS);
  }

  /**
   * Sends a calculation request to the worker.
   */
  function requestCalculation(gridStep: number): void {
    if (!worker) return;

    requestId += 1;
    const currentId = requestId;

    const request: HeatmapWorkerRequest = {
      type: 'calculate',
      id: currentId,
      aps,
      walls,
      bounds,
      gridStep,
      outputWidth,
      outputHeight,
      band,
      colorScheme,
      calibratedN,
    };

    worker.postMessage(request);
  }

  // ─── Worker Response Handler ───────────────────────────────────

  /**
   * Handles messages from the Web Worker.
   */
  function handleWorkerMessage(event: MessageEvent<HeatmapWorkerResponse>): void {
    const response = event.data;

    switch (response.type) {
      case 'result': {
        applyResult(response.buffer, response.width, response.height);
        lastCalcTimeMs = response.calculationTimeMs;

        if (fineCalculationPending && response.id === requestId) {
          fineCalculationPending = false;
        }
        break;
      }
      case 'progress': {
        // Progress updates can be used for a loading indicator
        break;
      }
      case 'error': {
        console.error('[HeatmapRenderer] Calculation error:', response.message);
        break;
      }
    }
  }

  /**
   * Applies the RGBA buffer from the worker to an offscreen canvas
   * that can be used as a Konva.Image source.
   */
  function applyResult(
    buffer: ArrayBuffer,
    width: number,
    height: number,
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[HeatmapRenderer] Failed to get canvas 2d context');
      return;
    }

    const imageData = new ImageData(
      new Uint8ClampedArray(buffer),
      width,
      height,
    );
    ctx.putImageData(imageData, 0, 0);

    heatmapCanvas = canvas;
  }

  /**
   * Returns the last calculation time (useful for benchmarking/debugging).
   */
  export function getLastCalcTimeMs(): number {
    return lastCalcTimeMs;
  }
</script>

{#if visible && heatmapCanvas}
  <KonvaImage
    config={{
      image: heatmapCanvas,
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
      opacity,
      listening: false,
    }}
  />
{/if}

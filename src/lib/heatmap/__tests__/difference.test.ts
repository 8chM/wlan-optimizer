/**
 * Unit tests for difference.ts (Phase 13b)
 *
 * Since jsdom doesn't support Canvas 2D context, we test the core logic
 * by extracting it and testing with raw ImageData-like structures.
 * Integration with real canvases is verified at build/runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock canvas getContext before importing the module
function createMockCanvas(width: number, height: number, pixelData?: Uint8ClampedArray) {
  const data = pixelData ?? new Uint8ClampedArray(width * height * 4);
  const imageData = { data, width, height };

  const ctx = {
    getImageData: vi.fn().mockReturnValue(imageData),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  };

  return {
    canvas: {
      width,
      height,
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement,
    ctx,
    imageData,
  };
}

// Mock document.createElement for canvas creation inside the module
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') {
    const mockCtx = {
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      })),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    };
    return {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tag);
});

// Now import after mocks are set up
const { computeHeatmapDifference, snapshotCanvas } = await import('../difference');

function fillPixels(
  data: Uint8ClampedArray,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
}

describe('snapshotCanvas', () => {
  it('creates a clone with correct dimensions', () => {
    const { canvas } = createMockCanvas(20, 15);
    const result = snapshotCanvas(canvas);

    expect(result.width).toBe(20);
    expect(result.height).toBe(15);
  });
});

describe('computeHeatmapDifference', () => {
  it('returns all unchanged for identical canvases', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(10 * 10 * 4);
    fillPixels(pixelsA, 100, 150, 80);
    fillPixels(pixelsB, 100, 150, 80);

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(10, 10, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.improvedCount).toBe(0);
    expect(result.degradedCount).toBe(0);
    expect(result.unchangedCount).toBe(100);
  });

  it('detects improvement when B has stronger signal proxy', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(10 * 10 * 4);
    fillPixels(pixelsA, 50, 50, 50);
    fillPixels(pixelsB, 50, 200, 50); // much more green = stronger signal proxy

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(10, 10, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.improvedCount).toBeGreaterThan(0);
    expect(result.degradedCount).toBe(0);
  });

  it('detects degradation when B has weaker signal proxy', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(10 * 10 * 4);
    fillPixels(pixelsA, 200, 200, 200);
    fillPixels(pixelsB, 50, 50, 50); // much weaker

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(10, 10, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.degradedCount).toBeGreaterThan(0);
    expect(result.improvedCount).toBe(0);
  });

  it('handles transparent pixels (no signal)', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(10 * 10 * 4);
    fillPixels(pixelsA, 0, 0, 0, 0); // transparent
    fillPixels(pixelsB, 0, 0, 0, 0);

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(10, 10, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.improvedCount).toBe(0);
    expect(result.degradedCount).toBe(0);
    expect(result.unchangedCount).toBe(100);
  });

  it('handles different canvas sizes (uses minimum)', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(5 * 5 * 4);
    fillPixels(pixelsA, 100, 100, 100);
    fillPixels(pixelsB, 100, 100, 100);

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(5, 5, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.canvas.width).toBe(5);
    expect(result.canvas.height).toBe(5);
  });

  it('computes positive avgDeltaDb for improvement', () => {
    const pixelsA = new Uint8ClampedArray(10 * 10 * 4);
    const pixelsB = new Uint8ClampedArray(10 * 10 * 4);
    fillPixels(pixelsA, 50, 50, 50);
    fillPixels(pixelsB, 50, 200, 50);

    const { canvas: canvasA } = createMockCanvas(10, 10, pixelsA);
    const { canvas: canvasB } = createMockCanvas(10, 10, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.avgDeltaDb).toBeGreaterThan(0);
  });

  it('returns a canvas in the result', () => {
    const pixelsA = new Uint8ClampedArray(20 * 15 * 4);
    const pixelsB = new Uint8ClampedArray(20 * 15 * 4);
    fillPixels(pixelsA, 100, 100, 100);
    fillPixels(pixelsB, 200, 200, 200);

    const { canvas: canvasA } = createMockCanvas(20, 15, pixelsA);
    const { canvas: canvasB } = createMockCanvas(20, 15, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    expect(result.canvas).toBeDefined();
    expect(result.canvas.width).toBe(20);
    expect(result.canvas.height).toBe(15);
  });

  it('totals match pixel count', () => {
    const pixelsA = new Uint8ClampedArray(5 * 5 * 4);
    const pixelsB = new Uint8ClampedArray(5 * 5 * 4);
    fillPixels(pixelsA, 50, 100, 50);
    fillPixels(pixelsB, 100, 200, 100);

    const { canvas: canvasA } = createMockCanvas(5, 5, pixelsA);
    const { canvas: canvasB } = createMockCanvas(5, 5, pixelsB);

    const result = computeHeatmapDifference(canvasA, canvasB);

    const total = result.improvedCount + result.degradedCount + result.unchangedCount;
    expect(total).toBe(25);
  });
});

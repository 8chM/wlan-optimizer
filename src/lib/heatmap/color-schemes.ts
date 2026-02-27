/**
 * Heatmap color scheme generators.
 *
 * Each generator returns a Uint32Array[256] lookup table in ABGR format
 * (little-endian, as used by ImageData on most systems).
 *
 * Index 0 = weakest signal (RSSI_MIN = -95 dBm)
 * Index 255 = strongest signal (RSSI_MAX = -30 dBm)
 *
 * Signal thresholds (from rf-modell.md):
 *   Excellent: > -50 dBm
 *   Good:      -50 to -65 dBm
 *   Fair:      -65 to -75 dBm
 *   Poor:      -75 to -85 dBm
 *   No signal: < -85 dBm
 *
 * Color scheme choices (D-17):
 *   Viridis  - Default, colorblind-friendly
 *   Jet      - Classic WLAN heatmap look
 *   Inferno  - High contrast alternative
 */

export type FrequencyBand = '2.4ghz' | '5ghz' | '6ghz';
export type ColorScheme = 'viridis' | 'jet' | 'inferno';

/**
 * Packs RGBA values into a single Uint32 in ABGR byte order (little-endian).
 * ImageData stores pixels as RGBA bytes, but when viewed as Uint32
 * on a little-endian system, the byte order is ABGR.
 */
function packABGR(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolates between color stops to produce a value at position t (0-1).
 */
function interpolateColorStops(
  stops: Array<{ pos: number; r: number; g: number; b: number }>,
  t: number,
): { r: number; g: number; b: number } {
  // Clamp t to [0, 1]
  const clamped = Math.max(0, Math.min(1, t));

  // Find surrounding stops
  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i];
    const next = stops[i + 1];

    if (current === undefined || next === undefined) continue;

    if (clamped >= current.pos && clamped <= next.pos) {
      const localT = (clamped - current.pos) / (next.pos - current.pos);
      return {
        r: Math.round(lerp(current.r, next.r, localT)),
        g: Math.round(lerp(current.g, next.g, localT)),
        b: Math.round(lerp(current.b, next.b, localT)),
      };
    }
  }

  // Fallback to last stop
  const last = stops[stops.length - 1];
  if (last) {
    return { r: last.r, g: last.g, b: last.b };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * Generates a Viridis color LUT (256 entries, ABGR format).
 *
 * Viridis goes from dark purple (weak signal) through teal/green
 * to bright yellow (strong signal). Colorblind-friendly.
 */
export function generateViridisLUT(alpha = 200): Uint32Array {
  const lut = new Uint32Array(256);

  // Viridis color stops (approximate, from matplotlib)
  const stops = [
    { pos: 0.0, r: 68, g: 1, b: 84 },       // Dark purple
    { pos: 0.13, r: 71, g: 44, b: 122 },     // Purple
    { pos: 0.25, r: 59, g: 82, b: 139 },     // Blue-purple
    { pos: 0.38, r: 44, g: 114, b: 142 },    // Blue-teal
    { pos: 0.5, r: 33, g: 145, b: 140 },     // Teal
    { pos: 0.63, r: 39, g: 173, b: 129 },    // Teal-green
    { pos: 0.75, r: 92, g: 200, b: 99 },     // Green
    { pos: 0.88, r: 170, g: 220, b: 50 },    // Yellow-green
    { pos: 1.0, r: 253, g: 231, b: 37 },     // Bright yellow
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const { r, g, b } = interpolateColorStops(stops, t);
    lut[i] = packABGR(r, g, b, alpha);
  }

  return lut;
}

/**
 * Generates a Jet color LUT (256 entries, ABGR format).
 *
 * Jet is the classic rainbow colormap: blue -> cyan -> green -> yellow -> red.
 * Familiar to users from traditional WLAN heatmap tools.
 */
export function generateJetLUT(alpha = 200): Uint32Array {
  const lut = new Uint32Array(256);

  const stops = [
    { pos: 0.0, r: 0, g: 0, b: 127 },       // Dark blue
    { pos: 0.1, r: 0, g: 0, b: 255 },        // Blue
    { pos: 0.25, r: 0, g: 127, b: 255 },     // Cyan-blue
    { pos: 0.375, r: 0, g: 255, b: 255 },    // Cyan
    { pos: 0.5, r: 0, g: 255, b: 0 },        // Green
    { pos: 0.625, r: 255, g: 255, b: 0 },    // Yellow
    { pos: 0.75, r: 255, g: 127, b: 0 },     // Orange
    { pos: 0.875, r: 255, g: 0, b: 0 },      // Red
    { pos: 1.0, r: 127, g: 0, b: 0 },        // Dark red
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const { r, g, b } = interpolateColorStops(stops, t);
    lut[i] = packABGR(r, g, b, alpha);
  }

  return lut;
}

/**
 * Generates an Inferno color LUT (256 entries, ABGR format).
 *
 * Inferno goes from black through purple/magenta/orange to bright yellow.
 * High contrast, good for presentations.
 */
export function generateInfernoLUT(alpha = 200): Uint32Array {
  const lut = new Uint32Array(256);

  // Inferno color stops (approximate, from matplotlib)
  const stops = [
    { pos: 0.0, r: 0, g: 0, b: 4 },         // Near black
    { pos: 0.13, r: 40, g: 11, b: 84 },      // Dark purple
    { pos: 0.25, r: 101, g: 21, b: 110 },    // Purple
    { pos: 0.38, r: 159, g: 42, b: 99 },     // Magenta
    { pos: 0.5, r: 212, g: 72, b: 66 },      // Red-orange
    { pos: 0.63, r: 245, g: 125, b: 21 },    // Orange
    { pos: 0.75, r: 250, g: 179, b: 6 },     // Yellow-orange
    { pos: 0.88, r: 245, g: 233, b: 65 },    // Yellow
    { pos: 1.0, r: 252, g: 255, b: 164 },    // Bright yellow-white
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const { r, g, b } = interpolateColorStops(stops, t);
    lut[i] = packABGR(r, g, b, alpha);
  }

  return lut;
}

/**
 * Returns the appropriate LUT generator for a given color scheme name.
 */
export function getColorLUT(scheme: ColorScheme, alpha = 200): Uint32Array {
  switch (scheme) {
    case 'viridis':
      return generateViridisLUT(alpha);
    case 'jet':
      return generateJetLUT(alpha);
    case 'inferno':
      return generateInfernoLUT(alpha);
  }
}

/**
 * Maps an RSSI value (dBm) to a LUT index (0-255).
 *
 * The mapping range is -95 dBm (index 0) to -30 dBm (index 255).
 * This covers the full practical range of indoor WLAN signals.
 */
export const RSSI_MIN = -95;
export const RSSI_MAX = -30;

export function rssiToLutIndex(rssiDbm: number): number {
  const normalized = (rssiDbm - RSSI_MIN) / (RSSI_MAX - RSSI_MIN);
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}

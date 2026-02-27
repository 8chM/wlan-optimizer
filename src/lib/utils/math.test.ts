import { describe, expect, it } from 'vitest';

/**
 * Dummy test to verify Vitest setup.
 * This file validates that the test infrastructure works correctly.
 *
 * RF model reference values from .claude/rules/rf-modell.md:
 * - PL(1m) @ 2.4 GHz: 40.05 dB
 * - PL(1m) @ 5 GHz: 46.42 dB
 * - n (residential): 3.5 (default)
 * - Smartphone receiver: -3 dBi
 */

/** Free-space path loss at 1m reference distance */
function referencePathLoss(frequencyGhz: number): number {
  // FSPL(1m) = 20 * log10(f_MHz) + 20 * log10(d_m) - 27.55
  // At d = 1m: 20 * log10(1) = 0, so FSPL = 20 * log10(f_MHz) - 27.55
  const frequencyMhz = frequencyGhz * 1000;
  return 20 * Math.log10(frequencyMhz) - 27.55;
}

/** Indoor path loss using ITU-R P.1238 model */
function indoorPathLoss(
  distanceM: number,
  referenceLossDb: number,
  pathLossExponent: number,
  wallAttenuationDb: number,
): number {
  if (distanceM <= 0) return referenceLossDb;
  return referenceLossDb + 10 * pathLossExponent * Math.log10(distanceM) + wallAttenuationDb;
}

/** Calculate RSSI from TX power, antenna gains, and path loss */
function calculateRssi(
  txPowerDbm: number,
  antennaGainDbi: number,
  receiverGainDbi: number,
  pathLossDb: number,
): number {
  return txPowerDbm + antennaGainDbi + receiverGainDbi - pathLossDb;
}

describe('Math utilities - Vitest setup verification', () => {
  it('should calculate reference path loss at 2.4 GHz', () => {
    const pl = referencePathLoss(2.4);
    expect(pl).toBeCloseTo(40.05, 1);
  });

  it('should calculate reference path loss at 5 GHz', () => {
    const pl = referencePathLoss(5.0);
    expect(pl).toBeCloseTo(46.42, 1);
  });

  it('should calculate indoor path loss at 1m (equals reference)', () => {
    const pl = indoorPathLoss(1, 40.05, 3.5, 0);
    expect(pl).toBeCloseTo(40.05, 2);
  });

  it('should calculate indoor path loss at 10m without walls', () => {
    const pl = indoorPathLoss(10, 40.05, 3.5, 0);
    // PL = 40.05 + 10 * 3.5 * log10(10) = 40.05 + 35 = 75.05
    expect(pl).toBeCloseTo(75.05, 2);
  });

  it('should calculate indoor path loss at 5m with one medium wall (20 dB)', () => {
    const pl = indoorPathLoss(5, 40.05, 3.5, 20);
    // PL = 40.05 + 10 * 3.5 * log10(5) + 20 = 40.05 + 24.46 + 20 = 84.51
    expect(pl).toBeCloseTo(84.51, 1);
  });

  it('should calculate RSSI for DAP-X2810 at 2.4 GHz, 10m, no walls', () => {
    // TX: 23 dBm, AP gain: 3.2 dBi, Rx gain: -3 dBi
    // PL at 10m: 40.05 + 35 = 75.05 dB
    const pl = indoorPathLoss(10, 40.05, 3.5, 0);
    const rssi = calculateRssi(23, 3.2, -3, pl);
    // RSSI = 23 + 3.2 + (-3) - 75.05 = -51.85 dBm
    expect(rssi).toBeCloseTo(-51.85, 1);
  });

  it('should calculate RSSI for DAP-X2810 at 5 GHz, 10m, no walls', () => {
    // TX: 26 dBm, AP gain: 4.3 dBi, Rx gain: -3 dBi
    // PL at 10m: 46.42 + 35 = 81.42 dB
    const pl = indoorPathLoss(10, 46.42, 3.5, 0);
    const rssi = calculateRssi(26, 4.3, -3, pl);
    // RSSI = 26 + 4.3 + (-3) - 81.42 = -54.12 dBm
    expect(rssi).toBeCloseTo(-54.12, 1);
  });

  it('should handle zero distance gracefully', () => {
    const pl = indoorPathLoss(0, 40.05, 3.5, 0);
    expect(pl).toBe(40.05);
  });
});

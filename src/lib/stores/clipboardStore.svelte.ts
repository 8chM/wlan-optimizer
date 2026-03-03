/**
 * Clipboard Store - In-memory clipboard for walls and APs.
 *
 * Stores copied wall and AP data for paste/duplicate operations.
 * Uses Svelte 5 runes for reactivity.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ClipboardWall {
  materialId: string;
  segments: { segment_order: number; x1: number; y1: number; x2: number; y2: number }[];
  attOverride24: number | null;
  attOverride5: number | null;
  attOverride6: number | null;
}

export interface ClipboardAp {
  apModelId: string | null;
  label: string | null;
  x: number;
  y: number;
  height_m: number;
  mounting: string;
  tx_power_24ghz_dbm: number | null;
  tx_power_5ghz_dbm: number | null;
  channel_24ghz: number | null;
  channel_5ghz: number | null;
  channel_width: string;
  enabled: boolean;
  orientation_deg: number;
}

export interface ClipboardData {
  walls: ClipboardWall[];
  aps: ClipboardAp[];
}

// ─── Store ──────────────────────────────────────────────────────

function createClipboardStore() {
  let data = $state<ClipboardData | null>(null);
  let pasteCount = $state(0);

  return {
    get hasData(): boolean {
      return data !== null && (data.walls.length > 0 || data.aps.length > 0);
    },

    get data(): ClipboardData | null {
      return data;
    },

    get pasteCount(): number {
      return pasteCount;
    },

    copy(walls: ClipboardWall[], aps: ClipboardAp[]): void {
      data = { walls, aps };
      pasteCount = 0;
    },

    paste(): ClipboardData | null {
      if (!data) return null;
      pasteCount += 1;
      return data;
    },

    clear(): void {
      data = null;
      pasteCount = 0;
    },
  };
}

/** Singleton clipboard store instance */
export const clipboardStore = createClipboardStore();

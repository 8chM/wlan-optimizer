/**
 * Type-safe wrapper around Tauri's invoke() with error handling.
 *
 * Provides:
 * - Typed command definitions for compile-time safety
 * - Centralized error handling with user-friendly messages
 * - Logging for debugging
 */

import { invoke } from '@tauri-apps/api/core';

// ─── IPC Error Type ──────────────────────────────────────────────

/** Shape of errors returned by the Rust backend */
export interface AppErrorResponse {
  kind: string;
  data: Record<string, string>;
}

/** Structured frontend error with context */
export interface InvokeError {
  command: string;
  message: string;
  raw: unknown;
}

// ─── Command Type Definitions ────────────────────────────────────

/**
 * Maps Tauri command names to their parameter and return types.
 * Adding a new IPC command requires an entry here for type safety.
 */
export interface CommandMap {
  // ── Project Commands ─────────────────────────────────────────
  create_project: {
    params: { name: string; description?: string; locale?: string };
    result: ProjectResponse;
  };
  get_project: {
    params: { id: string };
    result: ProjectResponse;
  };
  list_projects: {
    params: Record<string, never>;
    result: ProjectResponse[];
  };
  delete_project: {
    params: { id: string };
    result: null;
  };

  // ── Settings Commands ────────────────────────────────────────
  get_settings: {
    params: Record<string, never>;
    result: AppSettingsResponse;
  };
  update_settings: {
    params: { settings: Partial<AppSettingsResponse> };
    result: AppSettingsResponse;
  };
  get_system_language: {
    params: Record<string, never>;
    result: string;
  };

  // ── Floor Commands ───────────────────────────────────────────
  get_floor_data: {
    params: { floorId: string };
    result: FloorDataResponse;
  };

  // ── Heatmap Settings Commands ────────────────────────────────
  get_heatmap_settings: {
    params: { projectId: string };
    result: HeatmapSettingsResponse;
  };
  update_heatmap_settings: {
    params: {
      projectId: string;
      colorScheme?: string;
      gridResolutionM?: number;
      pathLossExponent?: number;
      opacity?: number;
      show24ghz?: boolean;
      show5ghz?: boolean;
    };
    result: HeatmapSettingsResponse;
  };
}

// ─── Response Types ──────────────────────────────────────────────

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  floor_plan_width_m: number | null;
  floor_plan_height_m: number | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsResponse {
  locale: string;
  theme: string;
  default_color_scheme: string;
  default_grid_resolution_m: number;
  iperf_server_ip: string | null;
  iperf_server_port: number;
  auto_save_enabled: boolean;
  auto_save_interval_s: number;
}

export interface FloorDataResponse {
  id: string;
  project_id: string;
  name: string;
  floor_number: number;
  scale_px_per_meter: number | null;
  width_meters: number | null;
  height_meters: number | null;
  ceiling_height_m: number;
  walls: WallResponse[];
  access_points: AccessPointResponse[];
}

export interface WallResponse {
  id: string;
  floor_id: string;
  material_id: string;
  segments: WallSegmentResponse[];
  attenuation_override_24ghz: number | null;
  attenuation_override_5ghz: number | null;
}

export interface WallSegmentResponse {
  id: string;
  wall_id: string;
  segment_order: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AccessPointResponse {
  id: string;
  floor_id: string;
  label: string | null;
  x: number;
  y: number;
  tx_power_24ghz_dbm: number | null;
  tx_power_5ghz_dbm: number | null;
  antenna_gain_24ghz_dbi: number | null;
  antenna_gain_5ghz_dbi: number | null;
  enabled: boolean;
}

export interface HeatmapSettingsResponse {
  id: string;
  project_id: string;
  color_scheme: string;
  grid_resolution_m: number;
  signal_threshold_excellent: number;
  signal_threshold_good: number;
  signal_threshold_fair: number;
  signal_threshold_poor: number;
  receiver_gain_dbi: number;
  path_loss_exponent: number;
  reference_loss_24ghz: number;
  reference_loss_5ghz: number;
  opacity: number;
  show_24ghz: boolean;
  show_5ghz: boolean;
}

// ─── Safe Invoke ─────────────────────────────────────────────────

/**
 * Type-safe wrapper around Tauri invoke().
 *
 * Automatically maps command names to their parameter and return types.
 * Provides structured error handling and logging.
 *
 * @example
 * ```ts
 * const projects = await safeInvoke('list_projects', {});
 * const project = await safeInvoke('get_project', { id: 'abc-123' });
 * ```
 */
export async function safeInvoke<K extends keyof CommandMap>(
  command: K,
  params: CommandMap[K]['params'],
): Promise<CommandMap[K]['result']> {
  try {
    const result = await invoke<CommandMap[K]['result']>(command, params);
    return result;
  } catch (error: unknown) {
    const message = extractErrorMessage(error);

    console.error(`[IPC] Command '${command}' failed:`, message);

    const invokeError: InvokeError = {
      command,
      message,
      raw: error,
    };

    throw invokeError;
  }
}

/**
 * Extracts a human-readable error message from a Tauri IPC error.
 */
function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error !== null && typeof error === 'object') {
    // AppError serialized by Rust
    const appError = error as Partial<AppErrorResponse>;
    if (appError.kind && appError.data) {
      const dataValues = Object.values(appError.data).join(', ');
      return `${appError.kind}: ${dataValues}`;
    }

    // Standard Error object
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }

  return 'Unknown error';
}

/**
 * Maps command names to user-friendly error titles.
 * Used for toast notifications.
 */
export function getErrorTitle(command: string): string {
  const titles: Record<string, string> = {
    create_project: 'Project creation failed',
    get_project: 'Could not load project',
    list_projects: 'Could not load project list',
    delete_project: 'Could not delete project',
    get_settings: 'Could not load settings',
    update_settings: 'Could not save settings',
    get_system_language: 'Could not detect system language',
    get_floor_data: 'Could not load floor data',
    get_heatmap_settings: 'Could not load heatmap settings',
    update_heatmap_settings: 'Could not save heatmap settings',
  };

  return titles[command] ?? `Command failed: ${command}`;
}

/**
 * Type-safe wrapper around Tauri's invoke() with error handling.
 *
 * Provides:
 * - Typed command definitions for compile-time safety
 * - Centralized error handling with user-friendly messages
 * - Logging for debugging
 */

// Dynamic import: only load Tauri API when running inside Tauri runtime
let tauriInvoke: typeof import('@tauri-apps/api/core').invoke | null = null;

// Detect Tauri runtime
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

if (IS_TAURI) {
  // Only import Tauri API when running in Tauri
  import('@tauri-apps/api/core').then((mod) => {
    tauriInvoke = mod.invoke;
  }).catch(() => {
    // Tauri API not available - stay in browser mode
  });
}

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
    params: { params: { name: string; description?: string; locale?: string } };
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
  update_project: {
    params: { params: { id: string; name?: string; description?: string; locale?: string } };
    result: ProjectResponse;
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
    params: { params: Partial<AppSettingsResponse> };
    result: AppSettingsResponse;
  };
  get_system_language: {
    params: Record<string, never>;
    result: string;
  };

  // ── Floor Commands ───────────────────────────────────────────
  create_floor: {
    params: {
      params: {
        project_id: string;
        name: string;
        floor_number: number;
        ceiling_height_m?: number;
        floor_material_id?: string;
      };
    };
    result: FloorResponse;
  };
  get_floors_by_project: {
    params: { project_id: string };
    result: FloorResponse[];
  };
  get_floor_data: {
    params: { floor_id: string };
    result: FloorDataResponse;
  };
  update_floor: {
    params: {
      params: {
        id: string;
        name?: string;
        floor_number?: number;
        ceiling_height_m?: number;
        floor_material_id?: string;
      };
    };
    result: FloorResponse;
  };
  set_floor_scale: {
    params: {
      floor_id: string;
      px_per_meter: number;
      width_meters: number;
      height_meters: number;
    };
    result: FloorResponse;
  };
  import_floor_image: {
    params: { floor_id: string; image_data: number[]; format: string };
    result: FloorResponse;
  };
  set_floor_rotation: {
    params: { floor_id: string; rotation: number };
    result: FloorResponse;
  };

  // ── Wall Commands ──────────────────────────────────────────
  create_wall: {
    params: {
      params: {
        floor_id: string;
        material_id: string;
        segments: SegmentInput[];
      };
    };
    result: WallResponse;
  };
  update_wall: {
    params: {
      params: {
        wall_id: string;
        material_id?: string;
        segments?: SegmentInput[];
        attenuation_override_24ghz?: number;
        attenuation_override_5ghz?: number;
        attenuation_override_6ghz?: number;
      };
    };
    result: WallResponse;
  };
  delete_wall: {
    params: { wall_id: string };
    result: null;
  };
  create_walls_batch: {
    params: {
      params: {
        floor_id: string;
        walls: CreateWallEntry[];
      };
    };
    result: WallResponse[];
  };

  // ── Access Point Commands ──────────────────────────────────
  create_access_point: {
    params: {
      params: {
        floor_id: string;
        ap_model_id?: string;
        label?: string;
        x: number;
        y: number;
        height_m?: number;
        mounting?: string;
      };
    };
    result: AccessPointResponse;
  };
  update_access_point: {
    params: {
      params: {
        access_point_id: string;
        x?: number;
        y?: number;
        height_m?: number;
        mounting?: string;
        tx_power_24ghz_dbm?: number;
        tx_power_5ghz_dbm?: number;
        channel_24ghz?: number;
        channel_5ghz?: number;
        channel_width?: string;
        enabled?: boolean;
      };
    };
    result: AccessPointResponse;
  };
  delete_access_point: {
    params: { access_point_id: string };
    result: null;
  };

  // ── Material Commands ──────────────────────────────────────
  list_materials: {
    params: { is_floor?: boolean };
    result: MaterialResponse[];
  };
  get_material: {
    params: { id: string };
    result: MaterialResponse;
  };
  create_user_material: {
    params: {
      params: {
        name_de: string;
        name_en: string;
        category: string;
        default_thickness_cm?: number;
        attenuation_24ghz_db: number;
        attenuation_5ghz_db: number;
        attenuation_6ghz_db: number;
        is_floor?: boolean;
        icon?: string;
      };
    };
    result: MaterialResponse;
  };
  update_material: {
    params: {
      params: {
        id: string;
        name_de?: string;
        name_en?: string;
        category?: string;
        default_thickness_cm?: number;
        attenuation_24ghz_db?: number;
        attenuation_5ghz_db?: number;
        attenuation_6ghz_db?: number;
        is_floor?: boolean;
        icon?: string;
      };
    };
    result: MaterialResponse;
  };

  // ── AP Model Commands ──────────────────────────────────────
  list_ap_models: {
    params: Record<string, never>;
    result: ApModelResponse[];
  };
  get_ap_model: {
    params: { id: string };
    result: ApModelResponse;
  };
  create_custom_ap_model: {
    params: {
      params: {
        manufacturer: string;
        model: string;
        wifi_standard?: string;
        max_tx_power_24ghz_dbm?: number;
        max_tx_power_5ghz_dbm?: number;
        max_tx_power_6ghz_dbm?: number;
        antenna_gain_24ghz_dbi?: number;
        antenna_gain_5ghz_dbi?: number;
        antenna_gain_6ghz_dbi?: number;
        mimo_streams?: number;
        supported_channels_24ghz?: string;
        supported_channels_5ghz?: string;
        supported_channels_6ghz?: string;
      };
    };
    result: ApModelResponse;
  };

  // ── Heatmap Settings Commands ────────────────────────────────
  get_heatmap_settings: {
    params: { project_id: string };
    result: HeatmapSettingsResponse;
  };
  update_heatmap_settings: {
    params: {
      params: {
        project_id: string;
        color_scheme?: string;
        grid_resolution_m?: number;
        path_loss_exponent?: number;
        opacity?: number;
        show_24ghz?: boolean;
        show_5ghz?: boolean;
        show_6ghz?: boolean;
      };
    };
    result: HeatmapSettingsResponse;
  };

  // ── Measurement Commands ──────────────────────────────────────
  create_measurement_run: {
    params: {
      params: {
        floor_id: string;
        run_number: number;
        run_type: string;
        iperf_server_ip?: string;
      };
    };
    result: MeasurementRunResponse;
  };
  create_measurement_point: {
    params: {
      params: {
        floor_id: string;
        label: string;
        x: number;
        y: number;
        auto_generated?: boolean;
        notes?: string;
      };
    };
    result: MeasurementPointResponse;
  };
  start_measurement: {
    params: { measurement_point_id: string; measurement_run_id: string };
    result: string;
  };
  get_measurement_points: {
    params: { floor_id: string };
    result: MeasurementPointResponse[];
  };
  get_measurement_runs: {
    params: { floor_id: string };
    result: MeasurementRunResponse[];
  };
  get_measurements_by_run: {
    params: { measurement_run_id: string };
    result: MeasurementResponse[];
  };
  cancel_measurement: {
    params: { measurement_run_id: string };
    result: null;
  };
  check_iperf_server: {
    params: { server_ip: string };
    result: boolean;
  };
  update_measurement_run_status: {
    params: {
      measurement_run_id: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    };
    result: null;
  };
  delete_measurement_run: {
    params: { run_id: string };
    result: { success: boolean };
  };
  delete_measurement_point: {
    params: { point_id: string };
    result: { success: boolean };
  };

  // ── Export Commands ──────────────────────────────────────────
  export_project: {
    params: { project_id: string; format: 'json' | 'csv' };
    result: string;
  };

  // ── Floor Image Commands ───────────────────────────────────
  get_floor_image: {
    params: { floor_id: string };
    result: FloorImageResponse | null;
  };

  // ── Save Measurement Command ───────────────────────────────
  save_measurement: {
    params: {
      params: {
        measurement_point_id: string;
        measurement_run_id: string;
        frequency_band: string;
        rssi_dbm?: number;
        noise_dbm?: number;
        iperf_tcp_upload_bps?: number;
        iperf_tcp_download_bps?: number;
        iperf_tcp_retransmits?: number;
        iperf_udp_throughput_bps?: number;
        iperf_udp_jitter_ms?: number;
        iperf_udp_lost_packets?: number;
        iperf_udp_total_packets?: number;
        raw_iperf_json?: string;
      };
    };
    result: string;
  };

  // ── Optimization Commands ────────────────────────────────────
  generate_optimization_plan: {
    params: { params: { project_id: string; floor_id: string; name?: string } };
    result: { plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] };
  };
  get_optimization_plan: {
    params: { plan_id: string };
    result: { plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] };
  };
  list_optimization_plans: {
    params: { project_id: string };
    result: OptimizationPlanResponse[];
  };
  update_optimization_step: {
    params: { step_id: string; applied: boolean };
    result: null;
  };
  update_optimization_plan_status: {
    params: { plan_id: string; status: 'draft' | 'applied' | 'verified' };
    result: null;
  };
}

// ─── Input Types (match Rust serde snake_case) ──────────────────

/** Segment input for wall creation/update (matches Rust SegmentParams) */
export interface SegmentInput {
  segment_order: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A single wall entry within a batch-create operation (matches Rust CreateWallEntry) */
export interface CreateWallEntry {
  material_id: string;
  segments: SegmentInput[];
  attenuation_override_24ghz?: number;
  attenuation_override_5ghz?: number;
  attenuation_override_6ghz?: number;
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

export interface FloorResponse {
  id: string;
  project_id: string;
  name: string;
  floor_number: number;
  background_image_format: string | null;
  background_image_rotation: number;
  scale_px_per_meter: number | null;
  width_meters: number | null;
  height_meters: number | null;
  ceiling_height_m: number;
  floor_material_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FloorDataResponse {
  id: string;
  project_id: string;
  name: string;
  floor_number: number;
  background_image_format: string | null;
  background_image_rotation: number;
  scale_px_per_meter: number | null;
  width_meters: number | null;
  height_meters: number | null;
  ceiling_height_m: number;
  floor_material_id: string | null;
  created_at: string;
  updated_at: string;
  walls: WallResponse[];
  access_points: AccessPointResponse[];
  measurement_points: MeasurementPointResponse[];
}

export interface WallResponse {
  id: string;
  floor_id: string;
  material_id: string;
  segments: WallSegmentResponse[];
  material: MaterialResponse;
  attenuation_override_24ghz: number | null;
  attenuation_override_5ghz: number | null;
  attenuation_override_6ghz: number | null;
  created_at: string;
  updated_at: string;
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
  ap_model_id: string | null;
  label: string | null;
  x: number;
  y: number;
  height_m: number;
  mounting: string;
  tx_power_24ghz_dbm: number | null;
  tx_power_5ghz_dbm: number | null;
  tx_power_6ghz_dbm: number | null;
  channel_24ghz: number | null;
  channel_5ghz: number | null;
  channel_6ghz: number | null;
  channel_width: string;
  band_steering_enabled: boolean;
  ip_address: string | null;
  ssid: string | null;
  enabled: boolean;
  orientation_deg: number;
  created_at: string;
  updated_at: string;
  ap_model: ApModelResponse | null;
}

export interface MaterialResponse {
  id: string;
  name_de: string;
  name_en: string;
  category: 'light' | 'medium' | 'heavy' | 'blocking';
  default_thickness_cm: number | null;
  attenuation_24ghz_db: number;
  attenuation_5ghz_db: number;
  attenuation_6ghz_db: number;
  is_floor: boolean;
  is_user_defined: boolean;
  is_quick_category: boolean;
  icon: string | null;
}

export interface ApModelResponse {
  id: string;
  manufacturer: string;
  model: string;
  wifi_standard: string | null;
  max_tx_power_24ghz_dbm: number | null;
  max_tx_power_5ghz_dbm: number | null;
  max_tx_power_6ghz_dbm: number | null;
  antenna_gain_24ghz_dbi: number | null;
  antenna_gain_5ghz_dbi: number | null;
  antenna_gain_6ghz_dbi: number | null;
  mimo_streams: number | null;
  supported_channels_24ghz: string | null;
  supported_channels_5ghz: string | null;
  supported_channels_6ghz: string | null;
  is_user_defined: boolean;
}

export interface FloorImageResponse {
  id: string;
  background_image: number[] | null;
  background_image_format: string | null;
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
  reference_loss_6ghz: number;
  opacity: number;
  show_24ghz: boolean;
  show_5ghz: boolean;
  show_6ghz: boolean;
}

export interface MeasurementRunResponse {
  id: string;
  floor_id: string;
  run_number: number;
  run_type: string;
  iperf_server_ip: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MeasurementPointResponse {
  id: string;
  floor_id: string;
  label: string;
  x: number;
  y: number;
  auto_generated: boolean;
  notes: string | null;
  created_at: string;
}

export interface MeasurementResponse {
  id: string;
  measurement_point_id: string;
  measurement_run_id: string;
  timestamp: string;
  frequency_band: string;
  rssi_dbm: number | null;
  noise_dbm: number | null;
  snr_db: number | null;
  connected_bssid: string | null;
  connected_ssid: string | null;
  frequency_mhz: number | null;
  tx_rate_mbps: number | null;
  iperf_tcp_upload_bps: number | null;
  iperf_tcp_download_bps: number | null;
  iperf_tcp_retransmits: number | null;
  iperf_udp_throughput_bps: number | null;
  iperf_udp_jitter_ms: number | null;
  iperf_udp_lost_packets: number | null;
  iperf_udp_total_packets: number | null;
  iperf_udp_lost_percent: number | null;
  quality: string;
  raw_iperf_json: string | null;
  created_at: string;
}

export interface CalibrationResultResponse {
  id: string;
  measurement_run_id: string;
  frequency_band: string;
  path_loss_exponent_original: number;
  path_loss_exponent_calibrated: number | null;
  wall_correction_factor: number;
  rmse_db: number | null;
  r_squared: number | null;
  max_deviation_db: number | null;
  num_measurement_points: number;
  confidence: string;
  created_at: string;
}

export interface OptimizationPlanResponse {
  id: string;
  project_id: string;
  name: string | null;
  mode: string;
  status: string;
  predicted_rmse_improvement_db: number | null;
  created_at: string;
  updated_at: string;
}

export interface OptimizationStepResponse {
  id: string;
  plan_id: string;
  access_point_id: string;
  step_order: number;
  parameter: string;
  old_value: string | null;
  new_value: string | null;
  description_de: string | null;
  description_en: string | null;
  applied: boolean;
  applied_at: string | null;
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
  // Browser preview mode: return mock data when Tauri is not available
  if (!IS_TAURI || !tauriInvoke) {
    return handleBrowserMock(command, params);
  }

  try {
    const result = await tauriInvoke<CommandMap[K]['result']>(command, params);
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
 * Handle IPC calls in browser mode with localStorage-based persistence.
 */
async function handleBrowserMock<K extends keyof CommandMap>(
  command: K,
  params: CommandMap[K]['params'],
): Promise<CommandMap[K]['result']> {
  const { executeBrowserCommand } = await import('./browser-backend');
  return executeBrowserCommand(command, params);
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
    update_project: 'Could not update project',
    delete_project: 'Could not delete project',
    get_settings: 'Could not load settings',
    update_settings: 'Could not save settings',
    get_system_language: 'Could not detect system language',
    create_floor: 'Could not create floor',
    get_floors_by_project: 'Could not load floors',
    get_floor_data: 'Could not load floor data',
    update_floor: 'Could not update floor',
    set_floor_scale: 'Could not update floor scale',
    import_floor_image: 'Could not import floor image',
    set_floor_rotation: 'Could not set floor rotation',
    create_wall: 'Could not create wall',
    update_wall: 'Could not update wall',
    delete_wall: 'Could not delete wall',
    create_walls_batch: 'Could not create walls batch',
    create_access_point: 'Could not create access point',
    update_access_point: 'Could not update access point',
    delete_access_point: 'Could not delete access point',
    list_materials: 'Could not load materials',
    get_material: 'Could not load material',
    create_user_material: 'Could not create material',
    update_material: 'Could not update material',
    list_ap_models: 'Could not load AP models',
    get_ap_model: 'Could not load AP model',
    create_custom_ap_model: 'Could not create AP model',
    get_heatmap_settings: 'Could not load heatmap settings',
    update_heatmap_settings: 'Could not save heatmap settings',
    create_measurement_run: 'Could not create measurement run',
    create_measurement_point: 'Could not create measurement point',
    start_measurement: 'Measurement failed',
    get_measurement_points: 'Could not load measurement points',
    get_measurement_runs: 'Could not load measurement runs',
    get_measurements_by_run: 'Could not load measurements',
    cancel_measurement: 'Could not cancel measurement',
    check_iperf_server: 'Server check failed',
    update_measurement_run_status: 'Could not update run status',
    delete_measurement_run: 'Could not delete measurement run',
    delete_measurement_point: 'Could not delete measurement point',
    export_project: 'Could not export project',
    get_floor_image: 'Could not load floor image',
    save_measurement: 'Could not save measurement',
    generate_optimization_plan: 'Could not generate optimization plan',
    get_optimization_plan: 'Could not load optimization plan',
    list_optimization_plans: 'Could not load optimization plans',
    update_optimization_step: 'Could not update optimization step',
    update_optimization_plan_status: 'Could not update plan status',
  };

  return titles[command] ?? `Command failed: ${command}`;
}

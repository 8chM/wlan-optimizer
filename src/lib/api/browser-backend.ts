/**
 * Browser Backend — localStorage-based persistence layer.
 *
 * Replaces the Tauri/Rust backend when running in a browser.
 * All data is stored in localStorage and survives page reloads.
 * Seeds with demo data on first load.
 */

import type {
  ProjectResponse,
  FloorResponse,
  FloorDataResponse,
  WallResponse,
  WallSegmentResponse,
  AccessPointResponse,
  MaterialResponse,
  ApModelResponse,
  AppSettingsResponse,
  HeatmapSettingsResponse,
  MeasurementPointResponse,
  SegmentInput,
  CommandMap,
} from './invoke';
import {
  MOCK_MATERIALS,
  MOCK_AP_MODELS,
  MOCK_PROJECT,
  MOCK_FLOOR,
  MOCK_FLOOR_DATA,
  MOCK_SETTINGS,
  MOCK_HEATMAP_SETTINGS,
} from './mock-data';

// ─── Storage Keys ─────────────────────────────────────────────────

const STORAGE_PREFIX = 'wlan-opt:';
const KEYS = {
  projects: `${STORAGE_PREFIX}projects`,
  floors: `${STORAGE_PREFIX}floors`,
  walls: `${STORAGE_PREFIX}walls`,
  aps: `${STORAGE_PREFIX}access-points`,
  materials: `${STORAGE_PREFIX}materials`,
  apModels: `${STORAGE_PREFIX}ap-models`,
  settings: `${STORAGE_PREFIX}settings`,
  heatmapSettings: `${STORAGE_PREFIX}heatmap-settings`,
  measurementPoints: `${STORAGE_PREFIX}measurement-points`,
  seeded: `${STORAGE_PREFIX}seeded`,
} as const;

// ─── UUID Helper ──────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function now(): string {
  return new Date().toISOString();
}

// ─── Storage Helpers ──────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[BrowserBackend] localStorage write failed:', e);
  }
}

// ─── Seed Demo Data ───────────────────────────────────────────────

function seedIfNeeded(): void {
  if (localStorage.getItem(KEYS.seeded)) return;

  save(KEYS.projects, [MOCK_PROJECT]);
  save(KEYS.floors, [MOCK_FLOOR]);
  save(KEYS.walls, MOCK_FLOOR_DATA.walls);
  save(KEYS.aps, MOCK_FLOOR_DATA.access_points);
  save(KEYS.materials, MOCK_MATERIALS);
  save(KEYS.apModels, MOCK_AP_MODELS);
  save(KEYS.settings, MOCK_SETTINGS);
  save(KEYS.heatmapSettings, [MOCK_HEATMAP_SETTINGS]);
  save(KEYS.measurementPoints, []);

  localStorage.setItem(KEYS.seeded, '1');
  console.info('[BrowserBackend] Demo data seeded');
}

// ─── Initialize ───────────────────────────────────────────────────

seedIfNeeded();

// ─── Command Handlers ─────────────────────────────────────────────

function findMaterial(id: string): MaterialResponse {
  const materials = load<MaterialResponse[]>(KEYS.materials, []);
  return materials.find((m) => m.id === id) ?? MOCK_MATERIALS[0]!;
}

function findApModel(id: string | null): ApModelResponse | null {
  if (!id) return null;
  const models = load<ApModelResponse[]>(KEYS.apModels, []);
  return models.find((m) => m.id === id) ?? null;
}

function enrichWall(wall: WallResponse): WallResponse {
  return { ...wall, material: findMaterial(wall.material_id) };
}

function enrichAP(ap: AccessPointResponse): AccessPointResponse {
  return { ...ap, ap_model: findApModel(ap.ap_model_id) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;

/**
 * Execute a command against the browser localStorage backend.
 */
export async function executeBrowserCommand<K extends keyof CommandMap>(
  command: K,
  params: CommandMap[K]['params'],
): Promise<CommandMap[K]['result']> {
  const p = params as AnyParams;
  const result = dispatch(command, p);
  console.info(`[BrowserBackend] ${command}`, result);
  return result as CommandMap[K]['result'];
}

function dispatch(command: string, p: AnyParams): unknown {
  switch (command) {
    // ── Projects ──────────────────────────────────────────────
    case 'list_projects':
      return load<ProjectResponse[]>(KEYS.projects, []);

    case 'get_project': {
      const projects = load<ProjectResponse[]>(KEYS.projects, []);
      const found = projects.find((pr) => pr.id === p.id);
      if (!found) throw { command, message: `Project not found: ${p.id}`, raw: null };
      return found;
    }

    case 'create_project': {
      const projects = load<ProjectResponse[]>(KEYS.projects, []);
      const newProject: ProjectResponse = {
        id: uuid(),
        name: p.params.name,
        description: p.params.description ?? null,
        floor_plan_width_m: 15,
        floor_plan_height_m: 10,
        locale: p.params.locale ?? 'de',
        created_at: now(),
        updated_at: now(),
      };
      projects.push(newProject);
      save(KEYS.projects, projects);

      // Auto-create a default floor
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const defaultFloor: FloorResponse = {
        id: uuid(),
        project_id: newProject.id,
        name: 'Erdgeschoss',
        floor_number: 0,
        background_image_format: null,
        scale_px_per_meter: 50,
        width_meters: 15,
        height_meters: 10,
        ceiling_height_m: 2.7,
        floor_material_id: null,
        created_at: now(),
        updated_at: now(),
      };
      floors.push(defaultFloor);
      save(KEYS.floors, floors);

      // Auto-create heatmap settings
      const heatmapSettings = load<HeatmapSettingsResponse[]>(KEYS.heatmapSettings, []);
      heatmapSettings.push({
        ...MOCK_HEATMAP_SETTINGS,
        id: uuid(),
        project_id: newProject.id,
      });
      save(KEYS.heatmapSettings, heatmapSettings);

      return newProject;
    }

    case 'update_project': {
      const projects = load<ProjectResponse[]>(KEYS.projects, []);
      const idx = projects.findIndex((pr) => pr.id === p.params.id);
      if (idx < 0) throw { command, message: `Project not found: ${p.params.id}`, raw: null };
      projects[idx] = {
        ...projects[idx]!,
        ...(p.params.name !== undefined && { name: p.params.name }),
        ...(p.params.description !== undefined && { description: p.params.description }),
        ...(p.params.locale !== undefined && { locale: p.params.locale }),
        updated_at: now(),
      };
      save(KEYS.projects, projects);
      return projects[idx]!;
    }

    case 'delete_project': {
      let projects = load<ProjectResponse[]>(KEYS.projects, []);
      const projectId = p.id;
      projects = projects.filter((pr) => pr.id !== projectId);
      save(KEYS.projects, projects);
      // Cascade: delete floors, walls, APs
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const floorIds = floors.filter((f) => f.project_id === projectId).map((f) => f.id);
      save(KEYS.floors, floors.filter((f) => f.project_id !== projectId));
      let walls = load<WallResponse[]>(KEYS.walls, []);
      walls = walls.filter((w) => !floorIds.includes(w.floor_id));
      save(KEYS.walls, walls);
      let aps = load<AccessPointResponse[]>(KEYS.aps, []);
      aps = aps.filter((a) => !floorIds.includes(a.floor_id));
      save(KEYS.aps, aps);
      return null;
    }

    // ── Settings ──────────────────────────────────────────────
    case 'get_settings':
      return load<AppSettingsResponse>(KEYS.settings, MOCK_SETTINGS);

    case 'update_settings': {
      const current = load<AppSettingsResponse>(KEYS.settings, MOCK_SETTINGS);
      const updated = { ...current, ...p.params };
      save(KEYS.settings, updated);
      return updated;
    }

    case 'get_system_language':
      return navigator.language.startsWith('de') ? 'de' : 'en';

    // ── Floors ────────────────────────────────────────────────
    case 'get_floors_by_project': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      return floors.filter((f) => f.project_id === p.project_id);
    }

    case 'get_floor_data': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const floor = floors.find((f) => f.id === p.floor_id);
      if (!floor) throw { command, message: `Floor not found: ${p.floor_id}`, raw: null };
      const walls = load<WallResponse[]>(KEYS.walls, [])
        .filter((w) => w.floor_id === p.floor_id)
        .map(enrichWall);
      const aps = load<AccessPointResponse[]>(KEYS.aps, [])
        .filter((a) => a.floor_id === p.floor_id)
        .map(enrichAP);
      const mps = load<MeasurementPointResponse[]>(KEYS.measurementPoints, [])
        .filter((mp) => mp.floor_id === p.floor_id);
      const result: FloorDataResponse = {
        ...floor,
        walls,
        access_points: aps,
        measurement_points: mps,
      };
      return result;
    }

    case 'create_floor': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const newFloor: FloorResponse = {
        id: uuid(),
        project_id: p.params.project_id,
        name: p.params.name,
        floor_number: p.params.floor_number,
        background_image_format: null,
        scale_px_per_meter: 50,
        width_meters: 15,
        height_meters: 10,
        ceiling_height_m: p.params.ceiling_height_m ?? 2.7,
        floor_material_id: p.params.floor_material_id ?? null,
        created_at: now(),
        updated_at: now(),
      };
      floors.push(newFloor);
      save(KEYS.floors, floors);
      return newFloor;
    }

    case 'update_floor': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const fi = floors.findIndex((f) => f.id === p.params.id);
      if (fi < 0) throw { command, message: `Floor not found`, raw: null };
      floors[fi] = { ...floors[fi]!, ...p.params, updated_at: now() };
      save(KEYS.floors, floors);
      return floors[fi]!;
    }

    case 'set_floor_scale': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const fi = floors.findIndex((f) => f.id === p.floor_id);
      if (fi < 0) throw { command, message: `Floor not found`, raw: null };
      floors[fi] = {
        ...floors[fi]!,
        scale_px_per_meter: p.px_per_meter,
        width_meters: p.width_meters,
        height_meters: p.height_meters,
        updated_at: now(),
      };
      save(KEYS.floors, floors);
      return floors[fi]!;
    }

    case 'import_floor_image': {
      // Browser can't persist large binary data easily; return floor as-is
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const floor = floors.find((f) => f.id === p.floor_id);
      if (!floor) throw { command, message: `Floor not found`, raw: null };
      return floor;
    }

    // ── Walls ─────────────────────────────────────────────────
    case 'create_wall': {
      const walls = load<WallResponse[]>(KEYS.walls, []);
      const wallId = uuid();
      const segments: WallSegmentResponse[] = (p.params.segments as SegmentInput[]).map(
        (s, i) => ({
          id: uuid(),
          wall_id: wallId,
          segment_order: s.segment_order ?? i,
          x1: s.x1,
          y1: s.y1,
          x2: s.x2,
          y2: s.y2,
        }),
      );
      const newWall: WallResponse = {
        id: wallId,
        floor_id: p.params.floor_id,
        material_id: p.params.material_id,
        segments,
        material: findMaterial(p.params.material_id),
        attenuation_override_24ghz: null,
        attenuation_override_5ghz: null,
        attenuation_override_6ghz: null,
        created_at: now(),
        updated_at: now(),
      };
      walls.push(newWall);
      save(KEYS.walls, walls);
      return enrichWall(newWall);
    }

    case 'update_wall': {
      const walls = load<WallResponse[]>(KEYS.walls, []);
      const wi = walls.findIndex((w) => w.id === p.params.wall_id);
      if (wi < 0) throw { command, message: `Wall not found`, raw: null };
      const wall = walls[wi]!;
      if (p.params.material_id) wall.material_id = p.params.material_id;
      if (p.params.segments) {
        wall.segments = (p.params.segments as SegmentInput[]).map((s, i) => ({
          id: uuid(),
          wall_id: wall.id,
          segment_order: s.segment_order ?? i,
          x1: s.x1,
          y1: s.y1,
          x2: s.x2,
          y2: s.y2,
        }));
      }
      if (p.params.attenuation_override_24ghz !== undefined)
        wall.attenuation_override_24ghz = p.params.attenuation_override_24ghz;
      if (p.params.attenuation_override_5ghz !== undefined)
        wall.attenuation_override_5ghz = p.params.attenuation_override_5ghz;
      if (p.params.attenuation_override_6ghz !== undefined)
        wall.attenuation_override_6ghz = p.params.attenuation_override_6ghz;
      wall.updated_at = now();
      wall.material = findMaterial(wall.material_id);
      walls[wi] = wall;
      save(KEYS.walls, walls);
      return enrichWall(wall);
    }

    case 'delete_wall': {
      let walls = load<WallResponse[]>(KEYS.walls, []);
      walls = walls.filter((w) => w.id !== p.wall_id);
      save(KEYS.walls, walls);
      return null;
    }

    case 'create_walls_batch': {
      const walls = load<WallResponse[]>(KEYS.walls, []);
      const created: WallResponse[] = [];
      for (const entry of p.params.walls) {
        const wallId = uuid();
        const segments: WallSegmentResponse[] = (entry.segments as SegmentInput[]).map(
          (s, i) => ({
            id: uuid(),
            wall_id: wallId,
            segment_order: s.segment_order ?? i,
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
          }),
        );
        const w: WallResponse = {
          id: wallId,
          floor_id: p.params.floor_id,
          material_id: entry.material_id,
          segments,
          material: findMaterial(entry.material_id),
          attenuation_override_24ghz: entry.attenuation_override_24ghz ?? null,
          attenuation_override_5ghz: entry.attenuation_override_5ghz ?? null,
          attenuation_override_6ghz: entry.attenuation_override_6ghz ?? null,
          created_at: now(),
          updated_at: now(),
        };
        walls.push(w);
        created.push(enrichWall(w));
      }
      save(KEYS.walls, walls);
      return created;
    }

    // ── Access Points ─────────────────────────────────────────
    case 'create_access_point': {
      const aps = load<AccessPointResponse[]>(KEYS.aps, []);
      const apModel = findApModel(p.params.ap_model_id ?? null);
      const newAp: AccessPointResponse = {
        id: uuid(),
        floor_id: p.params.floor_id,
        ap_model_id: p.params.ap_model_id ?? null,
        label: p.params.label ?? null,
        x: p.params.x,
        y: p.params.y,
        height_m: p.params.height_m ?? 2.5,
        mounting: p.params.mounting ?? 'ceiling',
        tx_power_24ghz_dbm: apModel?.max_tx_power_24ghz_dbm ?? 17,
        tx_power_5ghz_dbm: apModel?.max_tx_power_5ghz_dbm ?? 20,
        tx_power_6ghz_dbm: null,
        channel_24ghz: 1,
        channel_5ghz: 36,
        channel_6ghz: null,
        channel_width: '80',
        band_steering_enabled: false,
        ip_address: null,
        ssid: null,
        enabled: true,
        created_at: now(),
        updated_at: now(),
        ap_model: apModel,
      };
      aps.push(newAp);
      save(KEYS.aps, aps);
      return enrichAP(newAp);
    }

    case 'update_access_point': {
      const aps = load<AccessPointResponse[]>(KEYS.aps, []);
      const ai = aps.findIndex((a) => a.id === p.params.access_point_id);
      if (ai < 0) throw { command, message: `AP not found`, raw: null };
      const ap = aps[ai]!;
      const updates = p.params;
      if (updates.x !== undefined) ap.x = updates.x;
      if (updates.y !== undefined) ap.y = updates.y;
      if (updates.height_m !== undefined) ap.height_m = updates.height_m;
      if (updates.mounting !== undefined) ap.mounting = updates.mounting;
      if (updates.tx_power_24ghz_dbm !== undefined) ap.tx_power_24ghz_dbm = updates.tx_power_24ghz_dbm;
      if (updates.tx_power_5ghz_dbm !== undefined) ap.tx_power_5ghz_dbm = updates.tx_power_5ghz_dbm;
      if (updates.channel_24ghz !== undefined) ap.channel_24ghz = updates.channel_24ghz;
      if (updates.channel_5ghz !== undefined) ap.channel_5ghz = updates.channel_5ghz;
      if (updates.channel_width !== undefined) ap.channel_width = updates.channel_width;
      if (updates.enabled !== undefined) ap.enabled = updates.enabled;
      ap.updated_at = now();
      aps[ai] = ap;
      save(KEYS.aps, aps);
      return enrichAP(ap);
    }

    case 'delete_access_point': {
      let aps = load<AccessPointResponse[]>(KEYS.aps, []);
      aps = aps.filter((a) => a.id !== p.access_point_id);
      save(KEYS.aps, aps);
      return null;
    }

    // ── Materials ─────────────────────────────────────────────
    case 'list_materials': {
      const materials = load<MaterialResponse[]>(KEYS.materials, MOCK_MATERIALS);
      if (p.is_floor !== undefined) return materials.filter((m) => m.is_floor === p.is_floor);
      return materials;
    }

    case 'get_material': {
      const materials = load<MaterialResponse[]>(KEYS.materials, MOCK_MATERIALS);
      const mat = materials.find((m) => m.id === p.id);
      if (!mat) throw { command, message: `Material not found`, raw: null };
      return mat;
    }

    case 'create_user_material': {
      const materials = load<MaterialResponse[]>(KEYS.materials, MOCK_MATERIALS);
      const newMat: MaterialResponse = {
        id: uuid(),
        name_de: p.params.name_de,
        name_en: p.params.name_en,
        category: p.params.category as MaterialResponse['category'],
        default_thickness_cm: p.params.default_thickness_cm ?? null,
        attenuation_24ghz_db: p.params.attenuation_24ghz_db,
        attenuation_5ghz_db: p.params.attenuation_5ghz_db,
        attenuation_6ghz_db: p.params.attenuation_6ghz_db,
        is_floor: p.params.is_floor ?? false,
        is_user_defined: true,
        is_quick_category: false,
        icon: p.params.icon ?? null,
      };
      materials.push(newMat);
      save(KEYS.materials, materials);
      return newMat;
    }

    case 'update_material': {
      const materials = load<MaterialResponse[]>(KEYS.materials, MOCK_MATERIALS);
      const mi = materials.findIndex((m) => m.id === p.params.id);
      if (mi < 0) throw { command, message: `Material not found`, raw: null };
      materials[mi] = { ...materials[mi]!, ...p.params, id: materials[mi]!.id };
      save(KEYS.materials, materials);
      return materials[mi]!;
    }

    // ── AP Models ─────────────────────────────────────────────
    case 'list_ap_models':
      return load<ApModelResponse[]>(KEYS.apModels, MOCK_AP_MODELS);

    case 'get_ap_model': {
      const models = load<ApModelResponse[]>(KEYS.apModels, MOCK_AP_MODELS);
      const model = models.find((m) => m.id === p.id);
      if (!model) throw { command, message: `AP model not found`, raw: null };
      return model;
    }

    case 'create_custom_ap_model': {
      const models = load<ApModelResponse[]>(KEYS.apModels, MOCK_AP_MODELS);
      const newModel: ApModelResponse = {
        id: uuid(),
        manufacturer: p.params.manufacturer,
        model: p.params.model,
        wifi_standard: p.params.wifi_standard ?? null,
        max_tx_power_24ghz_dbm: p.params.max_tx_power_24ghz_dbm ?? null,
        max_tx_power_5ghz_dbm: p.params.max_tx_power_5ghz_dbm ?? null,
        max_tx_power_6ghz_dbm: p.params.max_tx_power_6ghz_dbm ?? null,
        antenna_gain_24ghz_dbi: p.params.antenna_gain_24ghz_dbi ?? null,
        antenna_gain_5ghz_dbi: p.params.antenna_gain_5ghz_dbi ?? null,
        antenna_gain_6ghz_dbi: p.params.antenna_gain_6ghz_dbi ?? null,
        mimo_streams: p.params.mimo_streams ?? null,
        supported_channels_24ghz: p.params.supported_channels_24ghz ?? null,
        supported_channels_5ghz: p.params.supported_channels_5ghz ?? null,
        supported_channels_6ghz: p.params.supported_channels_6ghz ?? null,
        is_user_defined: true,
      };
      models.push(newModel);
      save(KEYS.apModels, models);
      return newModel;
    }

    // ── Heatmap Settings ──────────────────────────────────────
    case 'get_heatmap_settings': {
      const allHs = load<HeatmapSettingsResponse[]>(KEYS.heatmapSettings, [MOCK_HEATMAP_SETTINGS]);
      return allHs.find((hs) => hs.project_id === p.project_id) ?? MOCK_HEATMAP_SETTINGS;
    }

    case 'update_heatmap_settings': {
      const allHs = load<HeatmapSettingsResponse[]>(KEYS.heatmapSettings, [MOCK_HEATMAP_SETTINGS]);
      const hi = allHs.findIndex((hs) => hs.project_id === p.params.project_id);
      if (hi >= 0) {
        allHs[hi] = { ...allHs[hi]!, ...p.params };
        save(KEYS.heatmapSettings, allHs);
        return allHs[hi]!;
      }
      const newHs = { ...MOCK_HEATMAP_SETTINGS, ...p.params, id: uuid() };
      allHs.push(newHs);
      save(KEYS.heatmapSettings, allHs);
      return newHs;
    }

    // ── Measurements (stubs — no real hardware in browser) ───
    case 'create_measurement_run':
      return {
        id: uuid(),
        floor_id: p.params.floor_id,
        run_number: p.params.run_number,
        run_type: p.params.run_type,
        iperf_server_ip: p.params.iperf_server_ip ?? null,
        status: 'pending',
        started_at: null,
        completed_at: null,
        created_at: now(),
      };

    case 'create_measurement_point': {
      const mps = load<MeasurementPointResponse[]>(KEYS.measurementPoints, []);
      const newMp: MeasurementPointResponse = {
        id: uuid(),
        floor_id: p.params.floor_id,
        label: p.params.label,
        x: p.params.x,
        y: p.params.y,
        auto_generated: p.params.auto_generated ?? false,
        notes: p.params.notes ?? null,
        created_at: now(),
      };
      mps.push(newMp);
      save(KEYS.measurementPoints, mps);
      return newMp;
    }

    case 'get_measurement_runs':
      return [];

    case 'get_measurements_by_run':
      return [];

    case 'start_measurement':
      throw { command, message: 'Measurements require the Tauri desktop app', raw: null };

    case 'cancel_measurement':
      return null;

    case 'check_iperf_server':
      return false;

    case 'update_measurement_run_status':
      return null;

    case 'save_measurement':
      return uuid();

    // ── Export ─────────────────────────────────────────────────
    case 'export_project': {
      const projects = load<ProjectResponse[]>(KEYS.projects, []);
      const project = projects.find((pr) => pr.id === p.project_id);
      const floors = load<FloorResponse[]>(KEYS.floors, []).filter(
        (f) => f.project_id === p.project_id,
      );
      const floorIds = floors.map((f) => f.id);
      const walls = load<WallResponse[]>(KEYS.walls, []).filter((w) =>
        floorIds.includes(w.floor_id),
      );
      const aps = load<AccessPointResponse[]>(KEYS.aps, []).filter((a) =>
        floorIds.includes(a.floor_id),
      );
      return JSON.stringify({ project, floors, walls, access_points: aps }, null, 2);
    }

    // ── Floor Image ───────────────────────────────────────────
    case 'get_floor_image':
      return null;

    // ── Optimization ──────────────────────────────────────────
    case 'generate_optimization_plan':
      return {
        plan: {
          id: uuid(),
          project_id: p.params.project_id,
          name: p.params.name ?? 'Browser-Optimierung',
          mode: 'forecast',
          status: 'draft',
          predicted_rmse_improvement_db: null,
          created_at: now(),
          updated_at: now(),
        },
        steps: [],
      };

    case 'get_optimization_plan':
      return {
        plan: {
          id: p.plan_id,
          project_id: '',
          name: '',
          mode: 'forecast',
          status: 'draft',
          predicted_rmse_improvement_db: null,
          created_at: now(),
          updated_at: now(),
        },
        steps: [],
      };

    case 'list_optimization_plans':
      return [];

    case 'update_optimization_step':
      return null;

    case 'update_optimization_plan_status':
      return null;

    default:
      console.warn(`[BrowserBackend] Unknown command: ${command}`);
      throw { command, message: `Browser: command '${command}' not implemented`, raw: null };
  }
}

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
  MeasurementRunResponse,
  MeasurementResponse,
  OptimizationPlanResponse,
  OptimizationStepResponse,
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
  measurementRuns: `${STORAGE_PREFIX}measurement-runs`,
  measurements: `${STORAGE_PREFIX}measurements`,
  optimizationPlans: `${STORAGE_PREFIX}optimization-plans`,
  optimizationSteps: `${STORAGE_PREFIX}optimization-steps`,
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
  const found = materials.find((m) => m.id === id);
  if (found) return found;
  // Fallback: check MOCK_MATERIALS for newly added materials not yet in localStorage
  const mock = MOCK_MATERIALS.find((m) => m.id === id);
  if (mock) {
    materials.push(mock);
    save(KEYS.materials, materials);
    return mock;
  }
  return MOCK_MATERIALS[0]!;
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
        background_image_rotation: 0,
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
      // Cascade: delete measurement runs, points, measurements
      const runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      const runIds = runs.filter((r) => floorIds.includes(r.floor_id)).map((r) => r.id);
      save(KEYS.measurementRuns, runs.filter((r) => !floorIds.includes(r.floor_id)));
      save(KEYS.measurementPoints, load<MeasurementPointResponse[]>(KEYS.measurementPoints, []).filter(
        (mp) => !floorIds.includes(mp.floor_id),
      ));
      save(KEYS.measurements, load<MeasurementResponse[]>(KEYS.measurements, []).filter(
        (m) => !runIds.includes(m.measurement_run_id),
      ));
      // Cascade: delete optimization plans and steps
      const plans = load<OptimizationPlanResponse[]>(KEYS.optimizationPlans, []);
      const planIds = plans.filter((pl) => pl.project_id === projectId).map((pl) => pl.id);
      save(KEYS.optimizationPlans, plans.filter((pl) => pl.project_id !== projectId));
      save(KEYS.optimizationSteps, load<OptimizationStepResponse[]>(KEYS.optimizationSteps, []).filter(
        (s) => !planIds.includes(s.plan_id),
      ));
      // Cascade: delete heatmap settings
      save(KEYS.heatmapSettings, load<HeatmapSettingsResponse[]>(KEYS.heatmapSettings, []).filter(
        (hs) => hs.project_id !== projectId,
      ));
      // Clean up floor images from localStorage
      for (const fid of floorIds) {
        try { localStorage.removeItem(`wlan-opt:floor-image:${fid}`); } catch { /* ignore */ }
      }
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
      return floors
        .filter((f) => f.project_id === p.project_id)
        .map((f) => ({ ...f, background_image_rotation: f.background_image_rotation ?? 0 }));
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
        // Default rotation for floors created before this field existed
        background_image_rotation: floor.background_image_rotation ?? 0,
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
        background_image_rotation: 0,
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
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const fi = floors.findIndex((f) => f.id === p.floor_id);
      if (fi < 0) throw { command, message: `Floor not found`, raw: null };
      const format = p.format ?? 'png';
      floors[fi] = { ...floors[fi]!, background_image_format: format, updated_at: now() };
      save(KEYS.floors, floors);

      // Convert image_data (number[]) to a data-URL and persist in localStorage
      if (p.image_data && Array.isArray(p.image_data) && p.image_data.length > 0) {
        const bytes = new Uint8Array(p.image_data as number[]);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);
        const mimeType =
          format === 'jpeg' || format === 'jpg'
            ? 'image/jpeg'
            : format === 'webp'
              ? 'image/webp'
              : 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const imageKey = `${STORAGE_PREFIX}floor-image:${p.floor_id}`;
        try {
          localStorage.setItem(imageKey, dataUrl);
        } catch (e) {
          console.warn('[BrowserBackend] Failed to store floor image in localStorage:', e);
        }
      }

      return floors[fi]!;
    }

    case 'set_floor_rotation': {
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const fi = floors.findIndex((f) => f.id === p.floor_id);
      if (fi < 0) throw { command, message: `Floor not found`, raw: null };
      // Normalize rotation to 0, 90, 180, 270
      const rotation = ((p.rotation % 360) + 360) % 360;
      floors[fi] = { ...floors[fi]!, background_image_rotation: rotation, updated_at: now() };
      save(KEYS.floors, floors);
      return floors[fi]!;
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
        // Build a lookup of existing segment IDs by segment_order
        const existingById = new Map<number, string>();
        for (const seg of wall.segments) {
          existingById.set(seg.segment_order, seg.id);
        }
        wall.segments = (p.params.segments as SegmentInput[]).map((s, i) => {
          const order = s.segment_order ?? i;
          return {
            id: existingById.get(order) ?? uuid(),
            wall_id: wall.id,
            segment_order: order,
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
          };
        });
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
        orientation_deg: 0,
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
      if (updates.label !== undefined) ap.label = updates.label;
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
      if (updates.orientation_deg !== undefined) ap.orientation_deg = updates.orientation_deg;
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

    // ── Measurements ──────────────────────────────────────────
    case 'create_measurement_run': {
      const runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      const newRun: MeasurementRunResponse = {
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
      runs.push(newRun);
      save(KEYS.measurementRuns, runs);
      return newRun;
    }

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

    case 'get_measurement_points': {
      const mps = load<MeasurementPointResponse[]>(KEYS.measurementPoints, []);
      return mps.filter((mp) => mp.floor_id === p.floor_id);
    }

    case 'get_measurement_runs': {
      const runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      return runs.filter((r) => r.floor_id === p.floor_id);
    }

    case 'get_measurements_by_run': {
      const measurements = load<MeasurementResponse[]>(KEYS.measurements, []);
      return measurements.filter((m) => m.measurement_run_id === p.measurement_run_id);
    }

    case 'start_measurement': {
      // Simulate a measurement in browser mode with realistic mock data
      const measurements = load<MeasurementResponse[]>(KEYS.measurements, []);
      const rssi = -40 - Math.floor(Math.random() * 40); // -40 to -80 dBm
      const quality = rssi > -65 ? 'good' : rssi > -75 ? 'fair' : 'poor';
      const newMeasurement: MeasurementResponse = {
        id: uuid(),
        measurement_point_id: p.measurement_point_id,
        measurement_run_id: p.measurement_run_id,
        timestamp: now(),
        frequency_band: '5ghz',
        rssi_dbm: rssi,
        noise_dbm: -95,
        snr_db: rssi - (-95),
        connected_bssid: '00:11:22:33:44:55',
        connected_ssid: 'WLAN-Demo',
        frequency_mhz: 5180,
        tx_rate_mbps: 866,
        iperf_tcp_upload_bps: 150_000_000 + Math.floor(Math.random() * 100_000_000),
        iperf_tcp_download_bps: 200_000_000 + Math.floor(Math.random() * 150_000_000),
        iperf_tcp_retransmits: Math.floor(Math.random() * 10),
        iperf_udp_throughput_bps: 100_000_000 + Math.floor(Math.random() * 50_000_000),
        iperf_udp_jitter_ms: 0.5 + Math.random() * 2,
        iperf_udp_lost_packets: Math.floor(Math.random() * 5),
        iperf_udp_total_packets: 10000,
        iperf_udp_lost_percent: Math.random() * 0.5,
        quality,
        raw_iperf_json: null,
        created_at: now(),
      };
      measurements.push(newMeasurement);
      save(KEYS.measurements, measurements);
      return newMeasurement.id;
    }

    case 'cancel_measurement': {
      const runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      const ri = runs.findIndex((r) => r.id === p.measurement_run_id);
      if (ri >= 0) {
        runs[ri] = { ...runs[ri]!, status: 'cancelled' };
        save(KEYS.measurementRuns, runs);
      }
      return null;
    }

    case 'check_iperf_server':
      // In browser mode, simulate server reachability
      return true;

    case 'update_measurement_run_status': {
      const runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      const ri = runs.findIndex((r) => r.id === p.measurement_run_id);
      if (ri >= 0) {
        runs[ri] = {
          ...runs[ri]!,
          status: p.status,
          ...(p.status === 'in_progress' && { started_at: now() }),
          ...(p.status === 'completed' && { completed_at: now() }),
        };
        save(KEYS.measurementRuns, runs);
      }
      return null;
    }

    case 'delete_measurement_run': {
      let runs = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []);
      const runId = p.run_id;
      runs = runs.filter((r) => r.id !== runId);
      save(KEYS.measurementRuns, runs);
      // Also remove all measurements belonging to this run
      let allMeasurements = load<MeasurementResponse[]>(KEYS.measurements, []);
      allMeasurements = allMeasurements.filter((m) => m.measurement_run_id !== runId);
      save(KEYS.measurements, allMeasurements);
      return { success: true };
    }

    case 'delete_measurement_point': {
      let mps = load<MeasurementPointResponse[]>(KEYS.measurementPoints, []);
      const pointId = p.point_id;
      mps = mps.filter((mp) => mp.id !== pointId);
      save(KEYS.measurementPoints, mps);
      // Also remove all measurements for this point
      let allMeasurements = load<MeasurementResponse[]>(KEYS.measurements, []);
      allMeasurements = allMeasurements.filter((m) => m.measurement_point_id !== pointId);
      save(KEYS.measurements, allMeasurements);
      return { success: true };
    }

    case 'save_measurement': {
      const measurements = load<MeasurementResponse[]>(KEYS.measurements, []);
      const measId = uuid();
      const newMeas: MeasurementResponse = {
        id: measId,
        measurement_point_id: p.params.measurement_point_id,
        measurement_run_id: p.params.measurement_run_id,
        timestamp: now(),
        frequency_band: p.params.frequency_band,
        rssi_dbm: p.params.rssi_dbm ?? null,
        noise_dbm: p.params.noise_dbm ?? null,
        snr_db: p.params.rssi_dbm && p.params.noise_dbm
          ? p.params.rssi_dbm - p.params.noise_dbm : null,
        connected_bssid: null,
        connected_ssid: null,
        frequency_mhz: null,
        tx_rate_mbps: null,
        iperf_tcp_upload_bps: p.params.iperf_tcp_upload_bps ?? null,
        iperf_tcp_download_bps: p.params.iperf_tcp_download_bps ?? null,
        iperf_tcp_retransmits: p.params.iperf_tcp_retransmits ?? null,
        iperf_udp_throughput_bps: p.params.iperf_udp_throughput_bps ?? null,
        iperf_udp_jitter_ms: p.params.iperf_udp_jitter_ms ?? null,
        iperf_udp_lost_packets: p.params.iperf_udp_lost_packets ?? null,
        iperf_udp_total_packets: p.params.iperf_udp_total_packets ?? null,
        iperf_udp_lost_percent: p.params.iperf_udp_lost_packets && p.params.iperf_udp_total_packets
          ? (p.params.iperf_udp_lost_packets / p.params.iperf_udp_total_packets) * 100 : null,
        quality: (p.params.rssi_dbm ?? -100) > -65 ? 'good'
          : (p.params.rssi_dbm ?? -100) > -75 ? 'fair' : 'poor',
        raw_iperf_json: p.params.raw_iperf_json ?? null,
        created_at: now(),
      };
      measurements.push(newMeas);
      save(KEYS.measurements, measurements);
      return measId;
    }

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
      const measurementRuns = load<MeasurementRunResponse[]>(KEYS.measurementRuns, []).filter(
        (r) => floorIds.includes(r.floor_id),
      );
      const runIds = measurementRuns.map((r) => r.id);
      const measurementPoints = load<MeasurementPointResponse[]>(
        KEYS.measurementPoints,
        [],
      ).filter((mp) => floorIds.includes(mp.floor_id));
      const measurements = load<MeasurementResponse[]>(KEYS.measurements, []).filter((m) =>
        runIds.includes(m.measurement_run_id),
      );
      const heatmapSettings = load<HeatmapSettingsResponse[]>(
        KEYS.heatmapSettings,
        [],
      ).filter((hs) => hs.project_id === p.project_id);
      const optimizationPlans = load<OptimizationPlanResponse[]>(
        KEYS.optimizationPlans,
        [],
      ).filter((pl) => pl.project_id === p.project_id);
      const planIds = optimizationPlans.map((pl) => pl.id);
      const optimizationSteps = load<OptimizationStepResponse[]>(
        KEYS.optimizationSteps,
        [],
      ).filter((s) => planIds.includes(s.plan_id));

      // CSV export: flat table with one row per measurement
      if (p.format === 'csv') {
        const csvEscape = (v: string | null | undefined): string => {
          if (v == null) return '';
          const s = String(v);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        };
        const optNum = (v: number | null | undefined): string => (v != null ? String(v) : '');

        const header = [
          'project_name', 'floor_name', 'floor_number', 'point_label', 'point_x', 'point_y',
          'run_number', 'run_type', 'run_status', 'measurement_id', 'timestamp', 'frequency_band',
          'rssi_dbm', 'noise_dbm', 'snr_db', 'connected_bssid', 'connected_ssid', 'frequency_mhz',
          'tx_rate_mbps', 'tcp_upload_bps', 'tcp_download_bps', 'tcp_retransmits',
          'udp_throughput_bps', 'udp_jitter_ms', 'udp_lost_packets', 'udp_total_packets',
          'udp_lost_percent', 'quality',
        ].join(',');

        const rows: string[] = [header];

        for (const m of measurements) {
          const run = measurementRuns.find((r) => r.id === m.measurement_run_id);
          const point = measurementPoints.find((mp) => mp.id === m.measurement_point_id);
          const fl = run ? floors.find((f) => f.id === run.floor_id) : undefined;
          rows.push([
            csvEscape(project?.name), csvEscape(fl?.name), String(fl?.floor_number ?? 0),
            csvEscape(point?.label), optNum(point?.x), optNum(point?.y),
            String(run?.run_number ?? 0), csvEscape(run?.run_type), csvEscape(run?.status),
            csvEscape(m.id), csvEscape(m.timestamp), csvEscape(m.frequency_band),
            optNum(m.rssi_dbm), optNum(m.noise_dbm), optNum(m.snr_db),
            csvEscape(m.connected_bssid), csvEscape(m.connected_ssid), optNum(m.frequency_mhz),
            optNum(m.tx_rate_mbps), optNum(m.iperf_tcp_upload_bps), optNum(m.iperf_tcp_download_bps),
            optNum(m.iperf_tcp_retransmits), optNum(m.iperf_udp_throughput_bps),
            optNum(m.iperf_udp_jitter_ms), optNum(m.iperf_udp_lost_packets),
            optNum(m.iperf_udp_total_packets), optNum(m.iperf_udp_lost_percent),
            csvEscape(m.quality),
          ].join(','));
        }

        return rows.join('\n');
      }

      return JSON.stringify(
        {
          project,
          floors,
          walls,
          access_points: aps,
          measurement_runs: measurementRuns,
          measurement_points: measurementPoints,
          measurements,
          heatmap_settings: heatmapSettings,
          optimization_plans: optimizationPlans,
          optimization_steps: optimizationSteps,
        },
        null,
        2,
      );
    }

    // ── Floor Image ───────────────────────────────────────────
    case 'get_floor_image': {
      // Check localStorage for base64 image data (stored as data-URL)
      const imageKey = `${STORAGE_PREFIX}floor-image:${p.floor_id}`;
      const imageData = localStorage.getItem(imageKey);
      if (!imageData) return null;
      const floors = load<FloorResponse[]>(KEYS.floors, []);
      const floor = floors.find((f) => f.id === p.floor_id);

      // Convert data-URL to byte array so callers get a consistent response
      let byteArray: number[] | null = null;
      try {
        const base64Match = imageData.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match && base64Match[1]) {
          const binary = atob(base64Match[1]);
          byteArray = new Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            byteArray[i] = binary.charCodeAt(i);
          }
        }
      } catch {
        // If conversion fails, callers will fall back to localStorage
      }

      return {
        id: p.floor_id,
        background_image: byteArray,
        background_image_format: floor?.background_image_format ?? 'png',
      };
    }

    // ── Optimization ──────────────────────────────────────────
    case 'generate_optimization_plan': {
      const plans = load<OptimizationPlanResponse[]>(KEYS.optimizationPlans, []);
      const allSteps = load<OptimizationStepResponse[]>(KEYS.optimizationSteps, []);

      const planId = uuid();
      const newPlan: OptimizationPlanResponse = {
        id: planId,
        project_id: p.params.project_id,
        name: p.params.name ?? 'Browser-Optimierung',
        mode: 'forecast',
        status: 'draft',
        predicted_rmse_improvement_db: null,
        created_at: now(),
        updated_at: now(),
      };
      plans.push(newPlan);

      // Generate optimization steps based on APs on the specified floor
      const aps = load<AccessPointResponse[]>(KEYS.aps, []);
      const floorAps = aps.filter((a) => a.floor_id === p.params.floor_id);

      const steps: OptimizationStepResponse[] = [];
      let stepOrder = 0;

      // Generate channel optimization steps for APs on same channel
      const channelGroups24 = new Map<number, AccessPointResponse[]>();
      for (const ap of floorAps) {
        if (!ap.enabled) continue;
        const ch = ap.channel_24ghz ?? 1;
        if (!channelGroups24.has(ch)) channelGroups24.set(ch, []);
        channelGroups24.get(ch)!.push(ap);
      }
      const bestChannels = [1, 6, 11];
      let chIdx = 0;
      for (const [ch, group] of channelGroups24) {
        if (group.length > 1) {
          for (let i = 1; i < group.length; i++) {
            const ap = group[i]!;
            const newCh = bestChannels[chIdx % bestChannels.length]!;
            if (newCh !== ch) {
              steps.push({
                id: uuid(),
                plan_id: planId,
                access_point_id: ap.id,
                step_order: stepOrder++,
                parameter: 'channel_24ghz',
                old_value: String(ch),
                new_value: String(newCh),
                description_de: `${ap.label ?? 'AP'}: 2.4 GHz Kanal von ${ch} auf ${newCh} aendern`,
                description_en: `${ap.label ?? 'AP'}: Change 2.4 GHz channel from ${ch} to ${newCh}`,
                applied: false,
                applied_at: null,
              });
            }
            chIdx++;
          }
        }
      }

      // If no channel conflicts, suggest TX power adjustment
      if (steps.length === 0) {
        for (const ap of floorAps) {
          if (!ap.enabled) continue;
          const currentPower = ap.tx_power_24ghz_dbm ?? 17;
          if (currentPower > 14) {
            steps.push({
              id: uuid(),
              plan_id: planId,
              access_point_id: ap.id,
              step_order: stepOrder++,
              parameter: 'tx_power_24ghz_dbm',
              old_value: String(currentPower),
              new_value: String(Math.max(8, currentPower - 3)),
              description_de: `${ap.label ?? 'AP'}: 2.4 GHz Sendeleistung von ${currentPower} auf ${Math.max(8, currentPower - 3)} dBm reduzieren`,
              description_en: `${ap.label ?? 'AP'}: Reduce 2.4 GHz TX power from ${currentPower} to ${Math.max(8, currentPower - 3)} dBm`,
              applied: false,
              applied_at: null,
            });
          }
        }
      }

      allSteps.push(...steps);
      save(KEYS.optimizationPlans, plans);
      save(KEYS.optimizationSteps, allSteps);
      return { plan: newPlan, steps };
    }

    case 'get_optimization_plan': {
      const plans = load<OptimizationPlanResponse[]>(KEYS.optimizationPlans, []);
      const plan = plans.find((pl) => pl.id === p.plan_id);
      if (!plan) throw { command, message: `Plan not found: ${p.plan_id}`, raw: null };
      const allSteps = load<OptimizationStepResponse[]>(KEYS.optimizationSteps, []);
      const steps = allSteps
        .filter((s) => s.plan_id === p.plan_id)
        .sort((a, b) => a.step_order - b.step_order);
      return { plan, steps };
    }

    case 'list_optimization_plans': {
      const plans = load<OptimizationPlanResponse[]>(KEYS.optimizationPlans, []);
      return plans.filter((pl) => pl.project_id === p.project_id);
    }

    case 'update_optimization_step': {
      const allSteps = load<OptimizationStepResponse[]>(KEYS.optimizationSteps, []);
      const si = allSteps.findIndex((s) => s.id === p.step_id);
      if (si >= 0) {
        allSteps[si] = {
          ...allSteps[si]!,
          applied: p.applied,
          applied_at: p.applied ? now() : null,
        };
        save(KEYS.optimizationSteps, allSteps);
      }
      return null;
    }

    case 'update_optimization_plan_status': {
      const plans = load<OptimizationPlanResponse[]>(KEYS.optimizationPlans, []);
      const pi = plans.findIndex((pl) => pl.id === p.plan_id);
      if (pi >= 0) {
        plans[pi] = { ...plans[pi]!, status: p.status, updated_at: now() };
        save(KEYS.optimizationPlans, plans);
      }
      return null;
    }

    default:
      console.warn(`[BrowserBackend] Unknown command: ${command}`);
      throw { command, message: `Browser: command '${command}' not implemented`, raw: null };
  }
}

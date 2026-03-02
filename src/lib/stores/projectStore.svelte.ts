/**
 * Project Store - Svelte 5 Runes-based store for project management.
 *
 * Manages the list of projects, the currently loaded project,
 * its floors, and dirty state for auto-save.
 */

import { type FloorDataResponse, type ProjectResponse, safeInvoke } from '$lib/api/invoke';

// ─── Types ──────────────────────────────────────────────────────

export interface ProjectState {
  readonly projects: ProjectResponse[];
  readonly currentProject: ProjectResponse | null;
  readonly floors: FloorDataResponse[];
  readonly activeFloorId: string | null;
  readonly isDirty: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
}

// ─── Store ──────────────────────────────────────────────────────

function createProjectStore() {
  let projects = $state<ProjectResponse[]>([]);
  let currentProject = $state<ProjectResponse | null>(null);
  let floors = $state<FloorDataResponse[]>([]);
  let activeFloorId = $state<string | null>(null);
  let isDirty = $state(false);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // ── Dirty tracking callbacks ────────────────────────────────
  let dirtyCallbacks: Array<(dirty: boolean) => void> = [];

  function notifyDirty(dirty: boolean): void {
    isDirty = dirty;
    for (const cb of dirtyCallbacks) {
      cb(dirty);
    }
  }

  return {
    // ── Getters (reactive via $state) ───────────────────────
    get projects() {
      return projects;
    },
    get currentProject() {
      return currentProject;
    },
    get floors() {
      return floors;
    },
    get activeFloorId() {
      return activeFloorId;
    },
    get isDirty() {
      return isDirty;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },

    get activeFloor(): FloorDataResponse | null {
      if (!activeFloorId) return floors[0] ?? null;
      return floors.find((f) => f.id === activeFloorId) ?? null;
    },

    // ── Actions ─────────────────────────────────────────────

    async loadProjects(): Promise<void> {
      isLoading = true;
      error = null;
      try {
        projects = await safeInvoke('list_projects', {} as Record<string, never>);
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        isLoading = false;
      }
    },

    async loadProject(id: string): Promise<void> {
      isLoading = true;
      error = null;
      try {
        currentProject = await safeInvoke('get_project', { id });

        // First get all floors for this project
        const projectFloors = await safeInvoke('get_floors_by_project', { project_id: id });

        if (projectFloors.length > 0) {
          // Load full floor data for the first floor
          const firstFloor = projectFloors[0]!;
          const floorData = await safeInvoke('get_floor_data', { floor_id: firstFloor.id });
          floors = [floorData];
          activeFloorId = firstFloor.id;
        } else {
          floors = [];
          activeFloorId = null;
        }

        isDirty = false;
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        isLoading = false;
      }
    },

    async createProject(name: string, description?: string): Promise<ProjectResponse | null> {
      isLoading = true;
      error = null;
      try {
        const project = await safeInvoke('create_project', {
          params: {
            name,
            description,
          },
        });
        projects = [...projects, project];
        return project;
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
        return null;
      } finally {
        isLoading = false;
      }
    },

    async deleteProject(id: string): Promise<boolean> {
      isLoading = true;
      error = null;
      try {
        await safeInvoke('delete_project', { id });
        projects = projects.filter((p) => p.id !== id);
        if (currentProject?.id === id) {
          currentProject = null;
          floors = [];
          activeFloorId = null;
        }
        return true;
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
        return false;
      } finally {
        isLoading = false;
      }
    },

    async refreshFloorData(): Promise<void> {
      if (!activeFloorId) return;
      try {
        const floorData = await safeInvoke('get_floor_data', { floor_id: activeFloorId });
        floors = floors.map((f) => (f.id === activeFloorId ? floorData : f));
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
      }
    },

    async saveCurrentProject(): Promise<void> {
      // In browser mode, all mutations are already persisted via localStorage.
      // In Tauri mode, the backend persists on each IPC call.
      // This method refreshes state and marks as clean.
      if (activeFloorId) {
        try {
          const floorData = await safeInvoke('get_floor_data', { floor_id: activeFloorId });
          floors = floors.map((f) => (f.id === activeFloorId ? floorData : f));
        } catch {
          // ignore
        }
      }
      isDirty = false;
    },

    setActiveFloor(id: string): void {
      if (floors.some((f) => f.id === id)) {
        activeFloorId = id;
      }
    },

    markDirty(): void {
      notifyDirty(true);
    },

    markClean(): void {
      notifyDirty(false);
    },

    onDirtyChange(callback: (dirty: boolean) => void): () => void {
      dirtyCallbacks.push(callback);
      return () => {
        dirtyCallbacks = dirtyCallbacks.filter((cb) => cb !== callback);
      };
    },

    async renameProject(id: string, newName: string): Promise<boolean> {
      error = null;
      try {
        const updated = await safeInvoke('update_project', {
          params: { id, name: newName },
        });
        projects = projects.map((p) => (p.id === id ? updated : p));
        if (currentProject?.id === id) {
          currentProject = updated;
        }
        return true;
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },

    reset(): void {
      currentProject = null;
      floors = [];
      activeFloorId = null;
      isDirty = false;
      error = null;
    },
  };
}

/** Singleton project store instance */
export const projectStore = createProjectStore();

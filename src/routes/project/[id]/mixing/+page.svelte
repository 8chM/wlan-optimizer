<!--
  Optimierung page - Combined recommendations wizard + manual mixing console.

  Integrates:
  - Tab 1 (Empfehlungen): Score header + recommendation wizard steps
  - Tab 2 (Manuell): MixingConsole + ChangeList + AssistSteps (existing)
  - FloorplanEditor with base heatmap + optional forecast overlay
  - EditorHeatmap for base stats (always visible)
-->
<script lang="ts">
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import CandidateLocationMarker from '$lib/canvas/CandidateLocationMarker.svelte';
  import ConstraintZoneRect from '$lib/canvas/ConstraintZoneRect.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
  import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
  import SavedMeasurements from '$lib/canvas/SavedMeasurements.svelte';
  import type { SavedMeasurement } from '$lib/canvas/SavedMeasurements.svelte';
  import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
  import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
  import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
  import MixingConsole from '$lib/components/mixing/MixingConsole.svelte';
  import ChangeList from '$lib/components/mixing/ChangeList.svelte';
  import AssistSteps from '$lib/components/mixing/AssistSteps.svelte';
  import ForecastHeatmap from '$lib/components/mixing/ForecastHeatmap.svelte';
  import HeatmapComparison from '$lib/components/comparison/HeatmapComparison.svelte';
  import OptimierungTabs from '$lib/components/optimierung/OptimierungTabs.svelte';
  import OptimierungHeader from '$lib/components/optimierung/OptimierungHeader.svelte';
  import RecommendationWizard from '$lib/components/optimierung/RecommendationWizard.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { mixingStore } from '$lib/stores/mixingStore.svelte';
  import { comparisonStore } from '$lib/stores/comparisonStore.svelte';
  import { recommendationStore } from '$lib/stores/recommendationStore.svelte';
  import { optimierungStore } from '$lib/stores/optimierungStore.svelte';
  import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';
  import { createRFConfig } from '$lib/heatmap/rf-engine';
  import type { CandidateLocation, ConstraintZone, APCapabilities, Recommendation, RejectionReason } from '$lib/recommendations/types';
  import { safeInvoke } from '$lib/api/invoke';
  import { updateAccessPoint } from '$lib/api/accessPoint';
  import { addApCommand, updateApCommand } from '$lib/stores/commands/apCommands';
  import { undoStore } from '$lib/stores/undoStore.svelte';
  import { t } from '$lib/i18n';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import type { Position } from '$lib/models/types';

  // Set page context for toolbar filtering
  $effect(() => {
    canvasStore.setPageContext('mixing');
  });

  // ─── Layout State ─────────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let floorImageDataUrl = $state<string | null>(null);
  let mousePosition = $state<Position | null>(null);
  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let annotations = $state<AnnotationData[]>([]);
  let savedMeasurements = $state<SavedMeasurement[]>([]);

  // Cursor per tool
  let canvasCursor = $derived.by(() => {
    if (canvasStore.spaceHeld) return 'grab';
    switch (canvasStore.activeTool) {
      case 'pan': return 'grab';
      case 'measure': return 'crosshair';
      default: return 'default';
    }
  });

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');
  let projectId = $derived(projectStore.currentProject?.id ?? '');

  // Access points from the floor data
  let accessPoints = $derived(floor?.access_points ?? []);
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);

  // Candidates and constraint zones from recommendation context
  let candidates = $derived(recommendationStore.context.candidates);
  let constraintZones = $derived(recommendationStore.context.constraintZones);

  // Preview state
  let previewRec = $state<Recommendation | null>(null);

  // APs with preview overrides applied (for visual marker rendering)
  let displayAccessPoints = $derived.by(() => {
    const aps = floor?.access_points ?? [];
    const change = previewRec?.suggestedChange;
    if (!change?.apId) return aps;

    return aps.map(ap => {
      if (ap.id !== change.apId) return ap;
      const updated = { ...ap };
      if (change.parameter === 'position') {
        const m = String(change.suggestedValue).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
        if (m) { updated.x = parseFloat(m[1]!); updated.y = parseFloat(m[2]!); }
      } else if (change.parameter === 'orientationDeg') {
        updated.orientation_deg = Number(change.suggestedValue);
      } else if (change.parameter === 'mounting') {
        updated.mounting = String(change.suggestedValue);
      }
      return updated;
    });
  });

  // Forecast heatmap state
  let forecastCanvas = $state<HTMLCanvasElement | null>(null);
  let forecastStats = $state<{ minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null>(null);

  // Floor bounds for heatmap (dynamic from wall/AP bounding box)
  let floorBounds = $derived.by(() => {
    const walls = floor?.walls ?? [];
    const aps = floor?.access_points ?? [];
    if (walls.length === 0 && aps.length === 0) {
      return { width: floor?.width_meters ?? 10, height: floor?.height_meters ?? 10, originX: 0, originY: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      for (const seg of w.segments) {
        minX = Math.min(minX, seg.x1, seg.x2);
        minY = Math.min(minY, seg.y1, seg.y2);
        maxX = Math.max(maxX, seg.x1, seg.x2);
        maxY = Math.max(maxY, seg.y1, seg.y2);
      }
    }
    for (const ap of aps) {
      minX = Math.min(minX, ap.x); minY = Math.min(minY, ap.y);
      maxX = Math.max(maxX, ap.x); maxY = Math.max(maxY, ap.y);
    }
    const pad = 2;
    return {
      originX: Math.floor(minX) - pad,
      originY: Math.floor(minY) - pad,
      width: Math.ceil(maxX - Math.floor(minX)) + 2 * pad,
      height: Math.ceil(maxY - Math.floor(minY)) + 2 * pad,
    };
  });

  // Changes as an array for components
  let changesArray = $derived(mixingStore.getChangeSummary());

  // Use forecast canvas when available, otherwise base heatmap
  let displayCanvas = $derived(mixingStore.forecastMode && forecastCanvas ? forecastCanvas : editorHeatmapStore.canvas);
  let heatmapVisible = $derived(displayCanvas !== null);

  // ─── Enable base heatmap on mount ─────────────────────────────

  $effect(() => {
    editorHeatmapStore.setVisible(true);
    return () => {
      editorHeatmapStore.setVisible(false);
    };
  });

  // ─── Load candidates/zones/capabilities from localStorage ─────

  $effect(() => {
    if (!floorId) return;
    try {
      const stored = localStorage.getItem(`wlan-opt:candidates:${floorId}`);
      const candidates: CandidateLocation[] = stored ? JSON.parse(stored) : [];
      recommendationStore.setCandidates(candidates);
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(`wlan-opt:zones:${floorId}`);
      const zones: ConstraintZone[] = stored ? JSON.parse(stored) : [];
      recommendationStore.setConstraintZones(zones);
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(`wlan-opt:capabilities:${floorId}`);
      if (stored) {
        const arr: APCapabilities[] = JSON.parse(stored);
        recommendationStore.setAPCapabilities(arr);
      }
    } catch { /* ignore */ }
  });

  // ─── Load background offset from localStorage ─────────────────

  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:bg-offset:${id}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          canvasStore.setBackgroundOffset(data.x, data.y);
        }
      } catch { /* ignore */ }
    }
  });

  // ─── Load annotations from localStorage (read-only) ─────────
  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:annotations:${id}`);
    if (stored) {
      try { annotations = JSON.parse(stored); } catch { /* ignore */ }
    } else {
      annotations = [];
    }
  });

  // ─── Load saved measurements from localStorage (read-only) ──
  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:measurements:${id}`);
    if (stored) {
      try { savedMeasurements = JSON.parse(stored); } catch { /* ignore */ }
    } else {
      savedMeasurements = [];
    }
  });

  // ─── Load Floor Image ──────────────────────────────────────────

  $effect(() => {
    const currentFloorId = floor?.id;
    if (!currentFloorId) return;
    loadFloorImage(currentFloorId);

    return () => {
      if (floorImageDataUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(floorImageDataUrl);
      }
    };
  });

  async function loadFloorImage(id: string): Promise<void> {
    try {
      const result = await safeInvoke('get_floor_image', { floor_id: id });
      if (result?.background_image && result.background_image_format) {
        const bytes = new Uint8Array(result.background_image);
        const blob = new Blob([bytes], { type: `image/${result.background_image_format}` });
        floorImageDataUrl = URL.createObjectURL(blob);
      } else {
        const stored = localStorage.getItem(`wlan-opt:floor-image:${id}`);
        if (stored) {
          floorImageDataUrl = stored;
        }
      }
    } catch {
      // No image available
    }
  }

  // ─── Load existing plan on mount, cleanup on unmount ────────────

  $effect(() => {
    if (projectId) {
      mixingStore.listPlans(projectId).then((plans) => {
        if (plans.length > 0) {
          const latest = plans[plans.length - 1]!;
          mixingStore.loadPlan(latest.id);
        }
      });
    }

    return () => {
      comparisonStore.reset();
      mixingStore.reset();
    };
  });

  // ─── Recommendation Analysis ────────────────────────────────────

  function runOptimierungAnalysis(): void {
    const stats = editorHeatmapStore.stats;
    const aps = floor?.access_points ?? [];
    const walls = floor?.walls ?? [];
    if (!stats || aps.length === 0) return;

    const band = editorHeatmapStore.band;
    const apConfigs = convertApsToConfig(aps, band);
    const wallData = convertWallsToData(walls, band);
    const rfConfig = createRFConfig(band, {
      pathLossExponent: editorHeatmapStore.calibratedN,
      receiverGain: editorHeatmapStore.receiverGainDbi,
      backSectorPenalty: editorHeatmapStore.backSectorPenalty,
      sideSectorPenalty: editorHeatmapStore.sideSectorPenalty,
    });

    recommendationStore.analyze(apConfigs, aps, wallData, floorBounds, band, stats, rfConfig);
  }

  function handleProfileChange(profile: import('$lib/recommendations/types').ExpertProfile): void {
    recommendationStore.setProfile(profile);
    // Re-run analysis if we have prior results
    if (recommendationStore.result) {
      runOptimierungAnalysis();
    }
  }

  // ─── Apply Recommendation to AP ─────────────────────────────────

  /** Persists a suggestedChange to the actual AP data and refreshes the floor. */
  async function applyRecommendationToAP(change: NonNullable<Recommendation['suggestedChange']>): Promise<void> {
    const { apId, parameter, suggestedValue } = change;
    if (!apId) return;

    const updates: Record<string, number | string> = {};

    if (parameter === 'position') {
      const m = String(suggestedValue).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
      if (m) {
        updates.x = parseFloat(m[1]!);
        updates.y = parseFloat(m[2]!);
      }
    } else if (parameter === 'orientationDeg') {
      updates.orientation_deg = Number(suggestedValue);
    } else if (parameter === 'mounting') {
      updates.mounting = String(suggestedValue);
    } else if (parameter === 'txPowerDbm') {
      // Legacy parameter name — map to band-specific
      const band = editorHeatmapStore.band;
      if (band === '2.4ghz') updates.tx_power_24ghz_dbm = Number(suggestedValue);
      else if (band === '6ghz') updates.tx_power_6ghz_dbm = Number(suggestedValue);
      else updates.tx_power_5ghz_dbm = Number(suggestedValue);
    } else if (parameter === 'tx_power_24ghz') {
      updates.tx_power_24ghz_dbm = Number(suggestedValue);
    } else if (parameter === 'tx_power_5ghz') {
      updates.tx_power_5ghz_dbm = Number(suggestedValue);
    } else if (parameter === 'tx_power_6ghz') {
      updates.tx_power_6ghz_dbm = Number(suggestedValue);
    } else if (parameter === 'channel') {
      // Legacy parameter name — map to band-specific
      const band = editorHeatmapStore.band;
      if (band === '2.4ghz') updates.channel_24ghz = Number(suggestedValue);
      else updates.channel_5ghz = Number(suggestedValue);
    } else if (parameter === 'channel_24ghz') {
      updates.channel_24ghz = Number(suggestedValue);
    } else if (parameter === 'channel_5ghz') {
      updates.channel_5ghz = Number(suggestedValue);
    }

    if (Object.keys(updates).length > 0) {
      await updateAccessPoint(apId, updates);
      await projectStore.refreshFloorData();
    }
  }

  // ─── Recommendation Step Handlers ───────────────────────────────

  const AP_CREATION_TYPES = new Set(['add_ap', 'preferred_candidate_location', 'infrastructure_required']);

  async function handleStepApply(rec: Recommendation): Promise<void> {
    if (rec.type === 'disable_ap' && rec.affectedApIds[0]) {
      const cmd = updateApCommand(
        rec.affectedApIds[0],
        { enabled: true },
        { enabled: false },
        () => projectStore.refreshFloorData(),
      );
      await undoStore.execute(cmd);
    } else if (AP_CREATION_TYPES.has(rec.type)) {
      const pos = rec.selectedCandidatePosition ?? rec.idealTargetPosition;
      const currentFloorId = floor?.id;
      if (pos && currentFloorId) {
        const cmd = addApCommand(currentFloorId, pos.x, pos.y, undefined, undefined, () => projectStore.refreshFloorData());
        await undoStore.execute(cmd);
      }
    } else if (rec.suggestedChange?.apId) {
      await applyRecommendationToAP(rec.suggestedChange);
    }
    optimierungStore.setStepState(rec.id, 'applied');
  }

  function handleStepSkip(rec: Recommendation): void {
    optimierungStore.setStepState(rec.id, 'skipped');
  }

  function handleStepReject(rec: Recommendation, reason: RejectionReason): void {
    recommendationStore.rejectAndRecompute(rec.id, reason);
    optimierungStore.resetSteps();
  }

  function handleStepSelect(rec: Recommendation): void {
    if (recommendationStore.selectedRecommendationId === rec.id) {
      recommendationStore.selectRecommendation(null);
    } else {
      recommendationStore.selectRecommendation(rec.id);
    }
  }

  // ─── Preview Handlers ──────────────────────────────────────────

  function handleStepPreview(rec: Recommendation): void {
    if (!rec.suggestedChange?.apId) return;
    previewRec = rec;
    const { apId, parameter, currentValue, suggestedValue } = rec.suggestedChange;
    const id = apId!;

    if (parameter === 'position') {
      // Parse "(x, y)" coordinate string → two separate overrides
      const match = String(suggestedValue).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
      if (match) {
        const oldMatch = String(currentValue).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
        mixingStore.applyChange(id, 'position_x', oldMatch?.[1] ?? null, match[1]!);
        mixingStore.applyChange(id, 'position_y', oldMatch?.[2] ?? null, match[2]!);
      }
    } else if (parameter === 'txPowerDbm') {
      // Legacy parameter name — map to band-specific
      const band = editorHeatmapStore.band;
      const paramKey = band === '2.4ghz' ? 'tx_power_24ghz' : band === '6ghz' ? 'tx_power_6ghz' : 'tx_power_5ghz';
      mixingStore.applyChange(id, paramKey, String(currentValue ?? ''), String(suggestedValue));
    } else if (parameter === 'tx_power_24ghz' || parameter === 'tx_power_5ghz' || parameter === 'tx_power_6ghz') {
      // Band-specific TX power — use parameter name directly
      mixingStore.applyChange(id, parameter, String(currentValue ?? ''), String(suggestedValue));
    } else if (parameter === 'channel') {
      // Legacy parameter name
      const band = editorHeatmapStore.band;
      const paramKey = band === '2.4ghz' ? 'channel_24ghz' : 'channel_5ghz';
      mixingStore.applyChange(id, paramKey, String(currentValue ?? ''), String(suggestedValue));
    } else if (parameter === 'channel_24ghz' || parameter === 'channel_5ghz') {
      // Band-specific channel — use parameter name directly
      mixingStore.applyChange(id, parameter, String(currentValue ?? ''), String(suggestedValue));
    } else {
      // orientationDeg, mounting → use parameter name directly as override key
      mixingStore.applyChange(id, parameter, String(currentValue ?? ''), String(suggestedValue));
    }
  }

  async function handlePreviewApply(): Promise<void> {
    if (!previewRec) return;
    if (previewRec.suggestedChange?.apId) {
      await applyRecommendationToAP(previewRec.suggestedChange);
    }
    optimierungStore.setStepState(previewRec.id, 'applied');
    // Clear forecast — base heatmap now reflects the change
    mixingStore.resetAll();
    forecastCanvas = null;
    forecastStats = null;
    previewRec = null;
  }

  function handlePreviewCancel(): void {
    mixingStore.resetAll();
    forecastCanvas = null;
    forecastStats = null;
    previewRec = null;
  }

  // ─── Mixing Console Handlers ────────────────────────────────────

  async function handleGeneratePlan(): Promise<void> {
    if (!projectId || !floorId) return;
    await mixingStore.generatePlan(projectId, floorId);
  }

  function handleChange(apId: string, parameter: string, oldValue: string | null, newValue: string | null): void {
    mixingStore.applyChange(apId, parameter, oldValue, newValue);
  }

  function handleResetAp(apId: string): void {
    mixingStore.resetAp(apId);
  }

  function handleResetAll(): void {
    mixingStore.resetAll();
    forecastCanvas = null;
    forecastStats = null;
  }

  async function handleApplyChanges(): Promise<void> {
    if (!mixingStore.currentPlan) return;
    for (const step of mixingStore.steps) {
      if (!step.applied) {
        await mixingStore.markStepApplied(step.id);
      }
    }
    await mixingStore.updatePlanStatus(mixingStore.currentPlan.id, 'applied');
  }

  async function handleToggleStep(stepId: string, applied: boolean): Promise<void> {
    if (applied) {
      await mixingStore.markStepApplied(stepId);
    } else {
      await mixingStore.markStepUnapplied(stepId);
    }
  }

  function handleForecastCanvas(canvas: HTMLCanvasElement | null): void {
    forecastCanvas = canvas;
  }

  function handleForecastStats(stats: { minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null): void {
    forecastStats = stats;
  }

  // ─── Canvas Handlers ────────────────────────────────────────────

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    mousePosition = { x: canvasX, y: canvasY };
    canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
  }

  $effect(() => {
    if (canvasStore.activeTool !== 'measure') {
      measureStart = null;
      measureEnd = null;
    }
  });

  function handleMeasureCanvasClick(canvasX: number, canvasY: number): void {
    if (canvasStore.activeTool === 'measure') {
      if (!measureStart) {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      } else if (!measureEnd) {
        measureEnd = { x: canvasX, y: canvasY };
      } else {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      }
    }
  }

  // ─── Keyboard Shortcuts ────────────────────────────────────────
  $effect(() => {
    const cleanup = registerShortcuts({
      selectTool: () => canvasStore.setTool('select'),
      panTool: () => canvasStore.setTool('pan'),
      measureTool: () => canvasStore.setTool('measure'),
      gridToggle: () => canvasStore.toggleGrid(),
      deselect: () => {
        if (measureStart) {
          measureStart = null;
          measureEnd = null;
          return;
        }
        canvasStore.setTool('select');
        canvasStore.clearSelection();
      },
      save: () => {
        // no-op on viewer pages
      },
    });
    return cleanup;
  });

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      canvasStore.setSpaceHeld(true);
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
    if (event.key === ' ' || event.code === 'Space') {
      canvasStore.setSpaceHeld(false);
    }
  }

  function handleTakeSnapshot(): void {
    if (!forecastCanvas) return;
    if (!comparisonStore.beforeCanvas) {
      comparisonStore.setBeforeSnapshot(forecastCanvas, t('mixing.original'));
    } else {
      comparisonStore.setAfterSnapshot(forecastCanvas, t('mixing.forecast'));
      comparisonStore.computeDifference();
      comparisonStore.activate();
    }
  }
</script>

<svelte:head>
  <title>{t('nav.optimize')} - {t('app.title')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Headless base heatmap renderer (always active) -->
{#if floor}
  <EditorHeatmap
    accessPoints={floor.access_points ?? []}
    walls={floor.walls ?? []}
    bounds={floorBounds}
    {scalePxPerMeter}
    outputWidth={containerWidth}
    outputHeight={containerHeight}
  />
{/if}

<!-- Headless forecast heatmap renderer -->
{#if floor}
  <ForecastHeatmap
    {accessPoints}
    walls={floor.walls ?? []}
    bounds={floorBounds}
    changes={changesArray}
    forecastActive={mixingStore.forecastMode}
    band={editorHeatmapStore.band}
    outputWidth={containerWidth}
    outputHeight={containerHeight}
    {scalePxPerMeter}
    onCanvas={handleForecastCanvas}
    onStats={handleForecastStats}
  />
{/if}

<div class="mixing-page">
  <!-- Left sidebar with tabs -->
  <aside class="mixing-sidebar">
    <OptimierungHeader
      result={recommendationStore.result}
      loading={recommendationStore.loading}
      profile={recommendationStore.profile}
      onAnalyze={runOptimierungAnalysis}
      onProfileChange={handleProfileChange}
    />

    <OptimierungTabs />

    <!-- Tab content -->
    {#if optimierungStore.activeTab === 'empfehlungen'}
      <RecommendationWizard
        result={recommendationStore.result}
        stepStates={optimierungStore.stepStates}
        onApply={handleStepApply}
        onSkip={handleStepSkip}
        onReject={handleStepReject}
        onSelect={handleStepSelect}
        onPreview={handleStepPreview}
        previewActive={previewRec !== null}
      />
    {:else}
      <!-- Manual tab: existing Mixing Console -->
      <MixingConsole
        {accessPoints}
        changes={changesArray}
        isGenerating={mixingStore.isGenerating}
        hasChanges={mixingStore.hasChanges}
        planStatus={mixingStore.currentPlan?.status ?? null}
        error={mixingStore.error}
        onGeneratePlan={handleGeneratePlan}
        onChange={handleChange}
        onResetAp={handleResetAp}
        onResetAll={handleResetAll}
        onApplyChanges={handleApplyChanges}
      />

      {#if mixingStore.hasChanges}
        <div class="section-divider"></div>
        <ChangeList
          changes={changesArray}
          {accessPoints}
        />
      {/if}

      {#if mixingStore.steps.length > 0}
        <div class="section-divider"></div>
        <AssistSteps
          steps={mixingStore.steps}
          {accessPoints}
          onToggleStep={handleToggleStep}
        />
      {/if}
    {/if}
  </aside>

  <!-- Center area with canvas -->
  <div
    class="mixing-canvas"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    style:cursor={canvasCursor}
  >
    {#if floor}
      <FloorplanEditor
        width={containerWidth}
        height={containerHeight}
        floorplanWidthM={floor.width_meters ?? 10}
        floorplanHeightM={floor.height_meters ?? 10}
        {scalePxPerMeter}
        onCanvasMouseMove={handleCanvasMouseMove}
        onCanvasClick={handleMeasureCanvasClick}
      >
        {#snippet background()}
          {#if canvasStore.backgroundVisible}
            <BackgroundImage
              imageData={floorImageDataUrl}
              {scalePxPerMeter}
              rotation={floorRotation}
              opacity={canvasStore.backgroundOpacity}
              userOffsetX={canvasStore.backgroundOffsetX}
              userOffsetY={canvasStore.backgroundOffsetY}
            />
          {/if}
          <GridOverlay
            gridSizeM={canvasStore.gridSize}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
            viewportWidth={containerWidth}
            viewportHeight={containerHeight}
            visible={canvasStore.gridVisible}
          />
          <ScaleIndicator
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
          />
        {/snippet}

        {#snippet heatmap()}
          <!-- Show forecast canvas when mixing has changes, otherwise base heatmap -->
          <HeatmapOverlay
            heatmapCanvas={displayCanvas}
            bounds={floorBounds}
            {scalePxPerMeter}
            visible={heatmapVisible}
            opacity={editorHeatmapStore.opacity}
          />
        {/snippet}

        {#snippet ui()}
          <!-- Walls (read-only) -->
          {#if floor.walls}
            {#each floor.walls as wall (wall.id)}
              <WallDrawingTool
                {wall}
                selected={false}
                interactive={false}
                {scalePxPerMeter}
              />
            {/each}
          {/if}

          <!-- Text annotations (read-only) -->
          {#each annotations as annotation (annotation.id)}
            <TextAnnotation
              {annotation}
              {scalePxPerMeter}
              selected={false}
              draggable={false}
            />
          {/each}

          <!-- Access points (with preview overrides applied) -->
          {#each displayAccessPoints as ap (ap.id)}
            <AccessPointMarker
              accessPoint={ap}
              selected={false}
              interactive={false}
              {scalePxPerMeter}
              draggable={false}
            />
          {/each}

          <!-- Candidate locations (read-only) -->
          {#each candidates as cand (cand.id)}
            <CandidateLocationMarker
              candidate={cand}
              selected={false}
              {scalePxPerMeter}
              draggable={false}
              interactive={false}
            />
          {/each}

          <!-- Constraint zones (read-only) -->
          {#each constraintZones as zone (zone.id)}
            <ConstraintZoneRect
              {zone}
              selected={false}
              {scalePxPerMeter}
              interactive={false}
            />
          {/each}

          <!-- Measure tool layer -->
          {#if canvasStore.activeTool === 'measure' && measureStart}
            <MeasureLayer
              startPoint={measureStart}
              endPoint={measureEnd}
              {scalePxPerMeter}
              mousePosition={mousePosition}
            />
          {/if}

          <!-- Saved measurements (read-only) -->
          {#if savedMeasurements.length > 0}
            <SavedMeasurements
              measurements={savedMeasurements}
              {scalePxPerMeter}
            />
          {/if}

          <!-- Crosshair cursor for measure tool -->
          {#if mousePosition && canvasStore.activeTool === 'measure'}
            <CrosshairCursor x={mousePosition.x} y={mousePosition.y} />
          {/if}

          <!-- Ruler overlay -->
          <RulerOverlay
            widthPx={containerWidth}
            heightPx={containerHeight}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
          />
        {/snippet}
      </FloorplanEditor>

      <!-- Canvas scrollbars overlay -->
      <CanvasScrollbars
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        contentWidth={(floor.width_meters ?? 10) * scalePxPerMeter}
        contentHeight={(floor.height_meters ?? 10) * scalePxPerMeter}
        scale={canvasStore.scale}
        offsetX={canvasStore.offsetX}
        offsetY={canvasStore.offsetY}
        onOffsetChange={(x, y) => canvasStore.setOffset(x, y)}
      />

      <!-- Preview banner -->
      {#if previewRec}
        <div class="preview-banner">
          <span class="preview-label">{t('opt.previewActive')}</span>
          <button class="preview-btn apply" onclick={handlePreviewApply}>{t('opt.apply')}</button>
          <button class="preview-btn cancel" onclick={handlePreviewCancel}>{t('opt.cancel')}</button>
        </div>
      {/if}

      <!-- Forecast stats overlay -->
      {#if forecastStats && mixingStore.forecastMode}
        <div class="forecast-badge">
          <span class="badge-label">{t('mixing.forecast')}</span>
          <span class="badge-stat">{forecastStats.avgRSSI.toFixed(0)} dBm {t('heatmap.avgRSSI')}</span>
          <span class="badge-time">{forecastStats.calculationTimeMs.toFixed(0)} ms</span>
          {#if forecastCanvas}
            <button class="snapshot-btn" onclick={handleTakeSnapshot}>
              {comparisonStore.beforeCanvas ? t('comparison.compare') : t('comparison.takeSnapshot')}
            </button>
          {/if}
        </div>
      {/if}

      <!-- Heatmap Comparison Panel -->
      <HeatmapComparison visible={comparisonStore.isActive} />
    {:else}
      <div class="empty-canvas">
        <p>{t('editor.noFloorplan')}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .mixing-page {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .mixing-sidebar {
    width: 320px;
    min-width: 320px;
    background: #1a1a2e;
    color: #c0c0d0;
    overflow-y: auto;
    padding: 8px;
    border-right: 1px solid #2a2a4e;
    flex-shrink: 0;
  }

  .mixing-sidebar::-webkit-scrollbar {
    width: 5px;
  }

  .mixing-sidebar::-webkit-scrollbar-track {
    background: transparent;
  }

  .mixing-sidebar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0;
  }

  .mixing-canvas {
    flex: 1;
    overflow: hidden;
    background: #e8e8f0;
    position: relative;
    outline: none;
  }

  .empty-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #6a6a8a;
    font-size: 1rem;
  }

  /* ─── Preview Banner ────────────────────────────────────────── */

  .preview-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(99, 102, 241, 0.9);
    border: 1px solid rgba(165, 180, 252, 0.4);
    border-radius: 6px;
    backdrop-filter: blur(4px);
    z-index: 10;
  }

  .preview-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .preview-btn {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s ease;
  }

  .preview-btn.apply {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
    color: #fff;
  }

  .preview-btn.apply:hover {
    background: rgba(34, 197, 94, 0.4);
  }

  .preview-btn.cancel {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
  }

  .preview-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  /* ─── Forecast Badge ─────────────────────────────────────────── */

  .forecast-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(26, 26, 46, 0.85);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 5px;
    backdrop-filter: blur(4px);
  }

  .badge-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #a5b4fc;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge-stat {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .badge-time {
    font-size: 0.6rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .snapshot-btn {
    padding: 3px 8px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 4px;
    color: #a5b4fc;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .snapshot-btn:hover {
    background: rgba(99, 102, 241, 0.35);
  }
</style>

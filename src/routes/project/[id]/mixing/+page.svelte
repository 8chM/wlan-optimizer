<!--
  Optimierung page - Sidebar-only: Recommendation wizard + manual mixing console.

  Canvas rendering is handled by the persistent WorkspaceCanvas in the layout.
  This page manages recommendation analysis, preview/apply workflow,
  forecast heatmap, and registers display overrides via workspaceStore.
-->
<script lang="ts">
  import MixingConsole from '$lib/components/mixing/MixingConsole.svelte';
  import ChangeList from '$lib/components/mixing/ChangeList.svelte';
  import AssistSteps from '$lib/components/mixing/AssistSteps.svelte';
  import ForecastHeatmap from '$lib/components/mixing/ForecastHeatmap.svelte';
  import HeatmapComparison from '$lib/components/comparison/HeatmapComparison.svelte';
  import EditorHeatmapPanel from '$lib/components/editor/EditorHeatmapPanel.svelte';
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
  import { workspaceStore } from '$lib/stores/workspaceStore.svelte';
  import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';
  import { createRFConfig } from '$lib/heatmap/rf-engine';
  import { updateAccessPoint } from '$lib/api/accessPoint';
  import { mapSuggestedChangeToApUpdate, mapSuggestedChangeToOverrides } from '$lib/recommendations/apFieldMap';
  import { addApCommand, updateApCommand } from '$lib/stores/commands/apCommands';
  import { undoStore } from '$lib/stores/undoStore.svelte';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import { t } from '$lib/i18n';
  import type { Recommendation, RejectionReason, CandidateLocation, ConstraintZone, APCapabilities } from '$lib/recommendations/types';
  import { exportRegressionFixture } from '$lib/recommendations/fixture-export';
  import { RECOMMENDATION_CATEGORIES } from '$lib/recommendations/types';

  // Set page context for toolbar filtering
  $effect(() => {
    canvasStore.setPageContext('mixing');
  });

  // ─── Keyboard Shortcuts ────────────────────────────────────────

  $effect(() => {
    const cleanup = registerShortcuts({
      heatmapToggle: () => { editorHeatmapStore.toggleVisible(); },
    });
    return cleanup;
  });

  // ─── Floor Data ─────────────────────────────────────────────────

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');
  let projectId = $derived(projectStore.currentProject?.id ?? '');
  let accessPoints = $derived(floor?.access_points ?? []);

  // ─── Preview State ──────────────────────────────────────────────

  let previewRec = $state<Recommendation | null>(null);

  // ─── Forecast Heatmap ───────────────────────────────────────────

  let forecastCanvas = $state<HTMLCanvasElement | null>(null);
  let forecastStats = $state<{ minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null>(null);

  // Floor bounds for forecast heatmap
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

  let changesArray = $derived(mixingStore.getChangeSummary());

  // ─── Sync forecast to workspaceStore (atomic — canvas + active in one effect) ──

  $effect(() => {
    workspaceStore.setForecastCanvas(forecastCanvas);
    // Show forecast heatmap ONLY when there are unapplied (pending) changes.
    // loadPlan() populates apChanges with plan steps that may already be applied —
    // those should NOT trigger forecast mode since the base heatmap already reflects them.
    // Also show forecast during recommendation preview (previewRec !== null).
    // On the Empfehlungen tab without preview, always show base heatmap so overlay
    // modes (AP Zones, Delta) and all panel controls work correctly.
    const hasPendingChanges = mixingStore.pendingChanges.length > 0;
    workspaceStore.setForecastActive(
      mixingStore.forecastMode &&
      forecastCanvas !== null &&
      hasPendingChanges &&
      (optimierungStore.activeTab === 'manuell' || previewRec !== null),
    );
  });

  // Display AP overrides for preview
  $effect(() => {
    if (!previewRec?.suggestedChange?.apId) {
      workspaceStore.setDisplayApOverrides(new Map());
      return;
    }
    const change = previewRec.suggestedChange;
    const overrides: Record<string, unknown> = {};
    if (change.parameter === 'position') {
      const m = String(change.suggestedValue).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
      if (m) { overrides.x = parseFloat(m[1]!); overrides.y = parseFloat(m[2]!); }
    } else if (change.parameter === 'orientationDeg') {
      overrides.orientation_deg = Number(change.suggestedValue);
    } else if (change.parameter === 'mounting') {
      overrides.mounting = String(change.suggestedValue);
    }
    if (Object.keys(overrides).length > 0) {
      workspaceStore.setDisplayApOverrides(new Map([[change.apId!, overrides]]));
    } else {
      workspaceStore.setDisplayApOverrides(new Map());
    }
  });

  // ─── Enable base heatmap on mount ─────────────────────────────

  $effect(() => {
    editorHeatmapStore.setVisible(true);
    return () => {
      // Don't reset heatmap visibility — EditorHeatmap is persistent in WorkspaceCanvas
      // But clear signal probe state so it doesn't persist across pages
      editorHeatmapStore.setProbeActive(false);
      workspaceStore.setForecastCanvas(null);
      workspaceStore.setForecastActive(false);
      workspaceStore.setDisplayApOverrides(new Map());
      comparisonStore.reset();
      mixingStore.reset();
    };
  });

  // ─── Load candidates/zones/capabilities/done-states from localStorage ──

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
    try {
      const stored = localStorage.getItem(`wlan-opt:instructional-done:${floorId}`);
      if (stored) {
        optimierungStore.loadDoneKeys(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  });

  // ─── Load existing plan on mount ────────────────────────────────

  $effect(() => {
    if (projectId) {
      mixingStore.listPlans(projectId).then((plans) => {
        if (plans.length > 0) {
          const latest = plans[plans.length - 1]!;
          mixingStore.loadPlan(latest.id);
        }
      });
    }
  });

  // ─── Recommendation Analysis ────────────────────────────────────

  function saveDoneState(): void {
    if (!floorId) return;
    try {
      localStorage.setItem(
        `wlan-opt:instructional-done:${floorId}`,
        JSON.stringify(optimierungStore.getDoneKeys()),
      );
    } catch { /* ignore */ }
  }

  /** Auto-restore done states for instructional recs after analysis */
  function restoreDoneInstructionalStates(): void {
    const recs = recommendationStore.result?.recommendations ?? [];
    for (const rec of recs) {
      const cat = RECOMMENDATION_CATEGORIES[rec.type];
      if (cat === 'instructional' && optimierungStore.isInstructionalDone(rec)) {
        optimierungStore.setStepState(rec.id, 'applied');
      }
    }
  }

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
    optimierungStore.setStale(false);
    restoreDoneInstructionalStates();
  }

  function handleProfileChange(profile: import('$lib/recommendations/types').ExpertProfile): void {
    recommendationStore.setProfile(profile);
    if (recommendationStore.result) {
      runOptimierungAnalysis();
    }
  }

  // ─── Apply Recommendation to AP ─────────────────────────────────

  async function applyRecommendationToAP(change: NonNullable<Recommendation['suggestedChange']>): Promise<void> {
    const { apId, parameter, suggestedValue } = change;
    if (!apId) return;
    const updates = mapSuggestedChangeToApUpdate(parameter, suggestedValue);
    if (Object.keys(updates).length > 0) {
      await updateAccessPoint(apId, updates);
      await projectStore.refreshFloorData();
    }
  }

  // ─── Recommendation Step Handlers ───────────────────────────────

  const AP_CREATION_TYPES = new Set(['add_ap', 'preferred_candidate_location']);

  async function handleStepApply(rec: Recommendation): Promise<void> {
    const cat = RECOMMENDATION_CATEGORIES[rec.type];

    if (cat === 'instructional') {
      // Instructional: mark as done (user performed the physical action)
      // Do NOT apply suggestedChange — user must update the floor plan manually
      optimierungStore.markInstructionalDone(rec);
      saveDoneState();
      optimierungStore.setStepState(rec.id, 'applied');
      // No stale — instructional actions don't change the heatmap model
      return;
    }

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
    if (cat === 'actionable_config' || cat === 'actionable_create') {
      optimierungStore.setStale(true);
    }
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

  // ─── Preview Handlers ───────────────────────────────────────────

  function handleStepPreview(rec: Recommendation): void {
    if (!rec.suggestedChange?.apId) return;
    previewRec = rec;
    const { apId, parameter, currentValue, suggestedValue } = rec.suggestedChange;
    const id = apId!;
    const oldOverrides = currentValue != null
      ? mapSuggestedChangeToOverrides(parameter, currentValue) : [];
    const newOverrides = mapSuggestedChangeToOverrides(parameter, suggestedValue);
    for (let i = 0; i < newOverrides.length; i++) {
      mixingStore.applyChange(id, newOverrides[i]!.key, oldOverrides[i]?.value ?? null, newOverrides[i]!.value);
    }
  }

  async function handlePreviewApply(): Promise<void> {
    if (!previewRec) return;
    const cat = RECOMMENDATION_CATEGORIES[previewRec.type];

    if (cat === 'instructional') {
      // Instructional preview confirm: mark as done, no actual AP change
      optimierungStore.markInstructionalDone(previewRec);
      saveDoneState();
      optimierungStore.setStepState(previewRec.id, 'applied');
    } else {
      if (previewRec.suggestedChange?.apId) {
        await applyRecommendationToAP(previewRec.suggestedChange);
      }
      optimierungStore.setStepState(previewRec.id, 'applied');
      if (cat === 'actionable_config' || cat === 'actionable_create') {
        optimierungStore.setStale(true);
      }
    }

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

  function handleForecastStats(stats: typeof forecastStats): void {
    forecastStats = stats;
  }

  function handleExportFixture(): void {
    const params = recommendationStore.lastAnalysisParams;
    if (!params) return;
    const fixture = exportRegressionFixture(params, recommendationStore.context, recommendationStore.profile);
    const json = JSON.stringify(fixture, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regression-fixture-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

<!-- Headless forecast heatmap renderer — only when there are unapplied changes -->
{#if floor}
  <ForecastHeatmap
    {accessPoints}
    walls={floor.walls ?? []}
    bounds={floorBounds}
    changes={changesArray}
    forecastActive={mixingStore.forecastMode && mixingStore.pendingChanges.length > 0 && (optimierungStore.activeTab === 'manuell' || previewRec !== null)}
    band={editorHeatmapStore.band}
    colorScheme={editorHeatmapStore.colorScheme}
    calibratedN={editorHeatmapStore.calibratedN}
    receiverGainDbi={editorHeatmapStore.receiverGainDbi}
    backSectorPenalty={editorHeatmapStore.backSectorPenalty}
    sideSectorPenalty={editorHeatmapStore.sideSectorPenalty}
    apFilter={editorHeatmapStore.apFilter ?? undefined}
    outputWidth={canvasStore.containerW}
    outputHeight={canvasStore.containerH}
    {scalePxPerMeter}
    onCanvas={handleForecastCanvas}
    onStats={handleForecastStats}
  />
{/if}

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
      stale={optimierungStore.stale}
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

<!-- Floating overlays (positioned over WorkspaceCanvas) -->
<div class="mixing-overlays">
  <!-- Preview banner -->
  {#if previewRec}
    <div class="preview-banner">
      <span class="preview-label">{t('opt.previewActive')}</span>
      {#if RECOMMENDATION_CATEGORIES[previewRec.type] === 'instructional'}
        <button class="preview-btn apply" onclick={handlePreviewApply}>{t('opt.markDone')}</button>
      {:else}
        <button class="preview-btn apply" onclick={handlePreviewApply}>{t('opt.apply')}</button>
      {/if}
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

  {#if import.meta.env.DEV}
    <button
      class="dev-export-btn"
      onclick={handleExportFixture}
      disabled={!recommendationStore.lastAnalysisParams}
      title="Speichert eine JSON-Datei, die in Tests via loadExportedFixture genutzt werden kann."
    >
      Export Regression Fixture (DEV)
    </button>
  {/if}
</div>

<!-- Floating Heatmap Controls Panel -->
<EditorHeatmapPanel />

<style>
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

  .mixing-overlays {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 320px; /* Offset past .mixing-sidebar width */
    pointer-events: none;
    z-index: 10;
  }

  .mixing-overlays > * {
    pointer-events: auto;
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

  .dev-export-btn {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 4px 10px;
    background: rgba(234, 179, 8, 0.2);
    border: 1px solid rgba(234, 179, 8, 0.5);
    border-radius: 4px;
    color: #eab308;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
  }

  .dev-export-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dev-export-btn:hover:not(:disabled) {
    background: rgba(234, 179, 8, 0.35);
  }
</style>

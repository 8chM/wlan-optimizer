<!--
  MeasurementWizard.svelte - Step-by-step measurement assistant.

  Steps:
  1. Server setup (show ServerSetupWizard if no server configured)
  2. Select/create run (Baseline=1, Post-Optimization=2, Verification=3)
  3. Place measurement points or click existing ones
  4. Run measurements (start, show progress, show results)
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { MeasurementRunResponse, MeasurementResponse, MeasurementPointResponse } from '$lib/api/invoke';
  import ServerSetupWizard from './ServerSetupWizard.svelte';
  import RunOverview from './RunOverview.svelte';
  import MeasurementProgress from './MeasurementProgress.svelte';
  import ResultCard from './ResultCard.svelte';
  import CalibrationResult from './CalibrationResult.svelte';
  import ManualEntryForm from './ManualEntryForm.svelte';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';

  // ─── Props ─────────────────────────────────────────────────────

  interface MeasurementWizardProps {
    /** Floor ID for the current floor */
    floorId: string;
    /** All measurement runs */
    runs: MeasurementRunResponse[];
    /** All measurements for the active run */
    measurements: MeasurementResponse[];
    /** All measurement points */
    points: MeasurementPointResponse[];
    /** Currently active run ID */
    activeRunId: string | null;
    /** Whether a measurement is in progress */
    isMeasuring: boolean;
    /** Current iPerf server IP */
    iperfServerIp: string;
    /** Whether server is reachable */
    iperfServerReachable: boolean | null;
    /** Whether server check is in progress */
    isCheckingServer: boolean;
    /** Measurement progress state */
    progress: { current: number; total: number; currentPointId: string; currentStep: string };
    /** Calibrated path loss exponent */
    calibratedN: number | null;
    /** Calibration RMSE */
    calibrationRMSE: number | null;
    /** Calibration confidence */
    calibrationConfidence: string | null;
    /** Original path loss exponent */
    calibrationOriginalN: number | null;
    /** R-squared value */
    calibrationRSquared: number | null;
    /** Max deviation in dB */
    calibrationMaxDeviation: number | null;
    /** Number of calibration points */
    calibrationPointCount: number;
    /** Error message */
    error: string | null;
    /** Callback: server IP changed */
    onServerIpChange?: (ip: string) => void;
    /** Callback: test server connection */
    onTestServer?: () => void;
    /** Callback: select a run */
    onSelectRun?: (runId: string) => void;
    /** Callback: create a new run */
    onCreateRun?: (runNumber: number, runType: string) => void;
    /** Callback: start measurement at a point */
    onStartMeasurement?: (pointId: string) => void;
    /** Callback: cancel current measurement */
    onCancelMeasurement?: () => void;
    /** Callback: apply calibration to heatmap */
    onApplyCalibration?: (calibratedN: number) => void;
    /** Callback: delete a run */
    onDeleteRun?: (runId: string) => void;
    /** Callback: update run status */
    onUpdateRunStatus?: (runId: string, status: 'completed' | 'cancelled') => void;
    /** Callback: delete a measurement point */
    onDeletePoint?: (pointId: string) => void;
    /** Callback: start placing a new measurement point on the canvas */
    onStartPlacingPoint?: () => void;
    /** Whether we are currently placing a measurement point */
    isPlacingPoint?: boolean;
  }

  let {
    floorId,
    runs,
    measurements,
    points,
    activeRunId = null,
    isMeasuring = false,
    iperfServerIp = '',
    iperfServerReachable = null,
    isCheckingServer = false,
    progress = { current: 0, total: 0, currentPointId: '', currentStep: '' },
    calibratedN = null,
    calibrationRMSE = null,
    calibrationConfidence = null,
    calibrationOriginalN = null,
    calibrationRSquared = null,
    calibrationMaxDeviation = null,
    calibrationPointCount = 0,
    error = null,
    onServerIpChange,
    onTestServer,
    onSelectRun,
    onCreateRun,
    onStartMeasurement,
    onCancelMeasurement,
    onApplyCalibration,
    onDeleteRun,
    onUpdateRunStatus,
    onDeletePoint,
    onStartPlacingPoint,
    isPlacingPoint = false,
  }: MeasurementWizardProps = $props();

  // ─── Local State ──────────────────────────────────────────────

  let wizardStep = $state<'server' | 'runs' | 'measure'>('server');
  let selectedPointId = $state<string | null>(null);
  let showManualEntry = $state(false);

  // ─── Derived ──────────────────────────────────────────────────

  let serverConfigured = $derived(iperfServerReachable === true);
  let hasActiveRun = $derived(activeRunId !== null);
  let activeRunMeasurements = $derived(
    measurements.filter((m) => m.measurement_run_id === activeRunId),
  );
  let selectedPointMeasurement = $derived(
    selectedPointId
      ? activeRunMeasurements.find((m) => m.measurement_point_id === selectedPointId) ?? null
      : null,
  );

  // Auto-advance wizard step based on state
  $effect(() => {
    if (serverConfigured && wizardStep === 'server') {
      wizardStep = 'runs';
    }
  });

  // ─── Handlers ─────────────────────────────────────────────────

  function handleServerContinue(): void {
    wizardStep = 'runs';
  }

  function handleSelectPoint(pointId: string): void {
    selectedPointId = pointId;
  }

  function handleStartMeasurement(): void {
    if (selectedPointId) {
      onStartMeasurement?.(selectedPointId);
    }
  }

  function handleDeletePoint(): void {
    if (selectedPointId && confirm(t('measurement.deletePointConfirm'))) {
      onDeletePoint?.(selectedPointId);
      selectedPointId = null;
    }
  }
</script>

<div class="measurement-wizard">
  <!-- Error display -->
  {#if error}
    <div class="error-banner">
      <span class="error-text">{error}</span>
    </div>
  {/if}

  <!-- Step 1: Server Setup -->
  {#if wizardStep === 'server'}
    <ServerSetupWizard
      serverIp={iperfServerIp}
      reachable={iperfServerReachable}
      checking={isCheckingServer}
      onIpChange={onServerIpChange}
      onTestConnection={onTestServer}
      onContinue={handleServerContinue}
    />
  {/if}

  <!-- Band Filter -->
  {#if wizardStep === 'runs' || wizardStep === 'measure'}
    <div class="band-filter">
      {#each [
        { value: 'all', label: t('measurement.bandFilterAll') },
        { value: '2.4ghz', label: t('measurement.bandFilter24') },
        { value: '5ghz', label: t('measurement.bandFilter5') },
        { value: '6ghz', label: t('measurement.bandFilter6') },
      ] as option (option.value)}
        <button
          class="band-btn"
          class:active={measurementStore.bandFilter === option.value}
          onclick={() => measurementStore.setBandFilter(option.value as 'all' | '2.4ghz' | '5ghz' | '6ghz')}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 2: Run Selection / Overview -->
  {#if wizardStep === 'runs' || wizardStep === 'measure'}
    <RunOverview
      {runs}
      {measurements}
      {activeRunId}
      onSelectRun={onSelectRun}
      onCreateRun={onCreateRun}
      onDeleteRun={onDeleteRun}
      onUpdateRunStatus={onUpdateRunStatus}
    />
  {/if}

  <!-- Step 3: Measurement Controls -->
  {#if wizardStep === 'runs' && hasActiveRun && !isMeasuring}
    <div class="measure-section">
      <div class="section-divider"></div>

      {#if points.length === 0}
        <p class="hint-text">{t('measurement.addPoint')}</p>
        <button class="add-point-btn" onclick={() => onStartPlacingPoint?.()} disabled={isPlacingPoint}>
          {isPlacingPoint ? t('measurement.clickToPlace') : t('measurement.placePoint')}
        </button>
      {:else}
        <div class="points-section">
          <div class="points-header">
            <span class="section-label">{points.length} {t('measurement.pointsCount')}</span>
            <button class="add-point-btn small" onclick={() => onStartPlacingPoint?.()} disabled={isPlacingPoint}>
              {isPlacingPoint ? t('measurement.clickToPlace') : '+'}
            </button>
          </div>
          <div class="point-list">
            {#each points as point (point.id)}
              <button
                class="point-btn"
                class:active={selectedPointId === point.id}
                class:measured={activeRunMeasurements.some((m) => m.measurement_point_id === point.id)}
                onclick={() => handleSelectPoint(point.id)}
              >
                {point.label}
              </button>
            {/each}
          </div>
        </div>

        {#if selectedPointId}
          <div class="point-actions">
            <button
              class="start-btn"
              onclick={handleStartMeasurement}
              disabled={isMeasuring}
            >
              {t('measurement.startMeasurement')}
            </button>
            <button
              class="delete-point-btn"
              onclick={handleDeletePoint}
              title={t('measurement.deletePoint')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
              {t('measurement.deletePoint')}
            </button>
          </div>

          <!-- Manual entry toggle -->
          {#if activeRunId}
            <button
              class="manual-toggle"
              onclick={() => { showManualEntry = !showManualEntry; }}
            >
              {t('measurement.manualOrAuto')}
            </button>
            {#if showManualEntry}
              <ManualEntryForm
                pointId={selectedPointId}
                runId={activeRunId}
                onSave={() => { showManualEntry = false; }}
              />
            {/if}
          {/if}
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Step 4: Progress Display -->
  {#if isMeasuring}
    <div class="section-divider"></div>
    <MeasurementProgress
      currentStep={progress.currentStep}
      current={progress.current}
      total={progress.total}
      onCancel={onCancelMeasurement}
    />
  {/if}

  <!-- Results for selected point -->
  {#if selectedPointMeasurement && !isMeasuring}
    <div class="section-divider"></div>
    <ResultCard
      measurement={selectedPointMeasurement}
      pointLabel={points.find((p) => p.id === selectedPointId)?.label ?? ''}
    />
  {/if}

  <!-- Calibration Result (after baseline run) -->
  {#if calibratedN !== null}
    <div class="section-divider"></div>
    <CalibrationResult
      {calibratedN}
      originalN={calibrationOriginalN}
      rmse={calibrationRMSE}
      confidence={calibrationConfidence}
      rSquared={calibrationRSquared}
      maxDeviation={calibrationMaxDeviation}
      pointCount={calibrationPointCount}
      onApply={onApplyCalibration}
    />
  {/if}
</div>

<style>
  .measurement-wizard {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 4px 0;
  }

  .error-banner {
    padding: 6px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 5px;
    margin-bottom: 8px;
  }

  .error-text {
    font-size: 0.7rem;
    color: #f87171;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0;
  }

  .measure-section {
    padding: 0;
  }

  .hint-text {
    margin: 0;
    font-size: 0.75rem;
    color: #808090;
    text-align: center;
    padding: 12px 0;
    font-style: italic;
  }

  .points-section {
    margin-bottom: 8px;
  }

  .points-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .add-point-btn {
    width: 100%;
    padding: 8px 12px;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 6px;
    color: #c7d2fe;
    font-size: 0.8rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-top: 6px;
  }

  .add-point-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
  }

  .add-point-btn:disabled {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.3);
    color: #86efac;
    cursor: default;
  }

  .add-point-btn.small {
    width: auto;
    padding: 2px 8px;
    margin-top: 0;
    font-size: 0.75rem;
  }

  .section-label {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .point-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .point-btn {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .point-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #c0c0d0;
  }

  .point-btn.active {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.4);
    color: #c7d2fe;
  }

  .point-btn.measured {
    border-color: rgba(34, 197, 94, 0.3);
    color: #86efac;
  }

  .start-btn {
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 6px;
    color: #c7d2fe;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .start-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.6);
    color: #e0e7ff;
  }

  .start-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .point-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    align-items: stretch;
  }

  .point-actions .start-btn {
    flex: 1;
    margin-top: 0;
  }

  .delete-point-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #f87171;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    white-space: nowrap;
  }

  .delete-point-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fca5a5;
  }

  .band-filter {
    display: flex;
    gap: 2px;
    padding: 4px 0;
  }

  .band-btn {
    flex: 1;
    padding: 3px 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: #808090;
    font-size: 0.65rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .band-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #a0a0b0;
  }

  .band-btn.active {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.4);
    color: #c7d2fe;
  }

  .manual-toggle {
    width: 100%;
    padding: 4px 8px;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #808090;
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-top: 4px;
  }

  .manual-toggle:hover {
    border-color: rgba(255, 255, 255, 0.25);
    color: #a0a0b0;
  }
</style>
